/**
 * Shared Express tail handlers — 404 + error translation.
 * Used by server.js, hub/app.js and selfhost-server.js so every entry point
 * answers JSON, never an HTML stack trace.
 */

export function notFound(_req, res) {
  res.status(404).json({ error: 'Route not found' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  // body-parser errors carry a `type`; treat client mistakes as 4xx.
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Ungültiges JSON im Request-Body' });
  if (err?.type === 'entity.too.large')   return res.status(413).json({ error: 'Request-Body zu groß' });
  if (err?.status && err.status >= 400 && err.status < 500) return res.status(err.status).json({ error: err.message || 'Bad request' });
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
}

/** Log (instead of crash on) stray rejections; the process stays up for other users. */
export function installProcessGuards() {
  process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));
  process.on('uncaughtException',  (err)    => { console.error('Uncaught exception:', err); process.exit(1); });
}
