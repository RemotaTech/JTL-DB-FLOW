/**
 * Desktop app — in-process HTTP server.
 *
 * Serves the built frontend (dist/) and the MSSQL bridge on 127.0.0.1 so the
 * renderer talks to the exact same `/api/*` routes as the web build does.
 * Same-origin ⇒ VITE_BRIDGE_URL stays '' and the Settings dialog honestly says
 * „Bleibt auf diesem Rechner“: credentials never leave the machine.
 *
 * Only loopback is bound — nothing on the LAN can reach this bridge.
 */
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { existsSync } from 'fs';
import { join } from 'path';
import { bridgeRouter } from '../bridge/app.js';
import { notFound, errorHandler } from '../bridge/errors.js';

/**
 * @param {{ distDir: string, port?: number, hubUrl?: string }} opts
 * @returns {Promise<{ server: import('http').Server, port: number, origin: string }>}
 */
export function startServer({ distDir, port = 0, hubUrl = '' }) {
  const app = express();
  app.disable('x-powered-by');

  const connectSrc = ["'self'", 'http://localhost:*', 'http://127.0.0.1:*'];
  if (/^https?:\/\//.test(hubUrl)) { try { connectSrc.push(new URL(hubUrl).origin); } catch { /* ignore */ } }

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src':  ["'self'"],
        'style-src':   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src':    ["'self'", 'https://fonts.gstatic.com', 'data:'],
        'img-src':     ["'self'", 'data:', 'blob:'],
        'connect-src': connectSrc,
        'frame-ancestors': ["'none'"],
        'object-src':  ["'none'"],
        'upgrade-insecure-requests': null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(compression());
  app.use(express.json({ limit: '256kb' }));

  app.use(bridgeRouter);

  if (distDir && existsSync(join(distDir, 'index.html'))) {
    app.use(express.static(distDir, { index: 'index.html', maxAge: 0 }));
    // SPA fallback for anything that is not an API route.
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(distDir, 'index.html')));
  }

  app.use(notFound);
  app.use(errorHandler);

  return new Promise((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1', () => {
      const actual = server.address().port;
      resolve({ server, port: actual, origin: `http://127.0.0.1:${actual}` });
    });
    server.on('error', reject);
  });
}
