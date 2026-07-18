/**
 * JTL Workflow Hub — Community flow sharing server
 * Allows users to publish, browse, and import JTL workflows.
 * Backed by PostgreSQL via Prisma.
 *
 * In production (Docker / Coolify) this server ALSO serves the Vite-built
 * frontend from the `dist/` directory so that only one container is needed.
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const prisma = new PrismaClient();

const app = express();

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());

// In production the frontend is served from this same origin, so the only
// cross-origin requests that need CORS are local dev (Vite proxy) and the
// MSSQL bridge (localhost:3001). Allow any origin so the deployed hub can be
// reached by users running the app locally or from any deployment URL.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : true; // `true` = reflect the request Origin (allow all)

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '5mb' }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(limiter);

// Stricter limiter for publishing — global limiter above is for browsing/reads.
const publishLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many flows published from this address — try again later.' },
});

// Gate destructive/admin actions behind a shared secret. Set HUB_ADMIN_KEY in
// the environment; without it, the route is disabled entirely (fails closed).
function requireAdminKey(req, res, next) {
  const key = process.env.HUB_ADMIN_KEY;
  if (!key) return res.status(503).json({ error: 'Admin actions are disabled on this hub' });
  if (req.get('x-admin-key') !== key) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Normalize a semicolon-separated tag string: trim, dedupe, lowercase. */
function normalizeTags(raw = '') {
  const seen = new Set();
  return raw
    .split(';')
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 0 && !seen.has(t) && seen.add(t))
    .join(';');
}

/** Parse a semicolon-separated tag string into an array. */
function parseTags(str = '') {
  return str.split(';').map(t => t.trim()).filter(Boolean);
}

// ── Routes ─────────────────────────────────────────────────────────────────

app.get('/api/hub/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * GET /api/hub/flows
 * Query params:
 *   tags    – semicolon-separated list; returns flows containing ANY of them
 *   search  – full-text search in title/description/tags
 *   page    – page number (default 1)
 *   limit   – page size (default 20, max 100)
 *   sort    – "downloads" | "newest" (default "downloads")
 */
app.get('/api/hub/flows', async (req, res) => {
  try {
    const { tags, search, page = '1', limit = '20', sort = 'downloads' } = req.query;
    const take = Math.min(parseInt(limit, 10) || 20, 100);
    const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

    const andClauses = [];

    if (tags) {
      const tagList = parseTags(tags);
      // Flow must match at least one tag (OR logic)
      andClauses.push({
        OR: tagList.map(tag => ({
          tags: { contains: tag, mode: 'insensitive' },
        })),
      });
    }

    if (search) {
      andClauses.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { tags: { contains: search, mode: 'insensitive' } },
          { author: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    if (req.query.featured === 'true') andClauses.push({ featured: true });

    const where = andClauses.length > 0 ? { AND: andClauses } : {};
    const orderBy =
      sort === 'newest'     ? [{ createdAt: 'desc' }] :
      sort === 'executions' ? [{ executions: 'desc' }, { downloads: 'desc' }] :
      sort === 'featured'   ? [{ featured: 'desc' }, { downloads: 'desc' }] :
                              [{ downloads: 'desc' }];

    const [flows, total] = await Promise.all([
      prisma.flow.findMany({
        where,
        orderBy,
        skip,
        take,
        // Exclude heavy flowData from list view for performance
        select: {
          id: true,
          title: true,
          description: true,
          tags: true,
          icon: true,
          color: true,
          author: true,
          downloads: true,
          executions: true,
          stepCount: true,
          featured: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.flow.count({ where }),
    ]);

    res.json({
      flows,
      pagination: {
        page: parseInt(page, 10) || 1,
        limit: take,
        total,
        pages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    console.error('GET /api/hub/flows error:', err.message);
    res.status(500).json({ error: 'Failed to fetch flows' });
  }
});

/**
 * GET /api/hub/flows/:id
 * Returns a single flow including its full flowData (nodes + edges).
 */
app.get('/api/hub/flows/:id', async (req, res) => {
  try {
    const flow = await prisma.flow.findUnique({ where: { id: req.params.id } });
    if (!flow) return res.status(404).json({ error: 'Flow not found' });
    res.json(flow);
  } catch (err) {
    console.error('GET /api/hub/flows/:id error:', err.message);
    res.status(500).json({ error: 'Failed to fetch flow' });
  }
});

/**
 * POST /api/hub/flows
 * Body: { title, description?, tags, icon?, color?, flowData: { steps, vars? }, author? }
 * Tags are semicolon-separated (e.g. "umsatz;kunden;aufträge").
 */
app.post('/api/hub/flows', publishLimiter, async (req, res) => {
  try {
    const { title, description, tags, icon, color, flowData, author } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (title.trim().length > 120) {
      return res.status(400).json({ error: 'Title must be 120 characters or fewer' });
    }
    if (!flowData || typeof flowData !== 'object' || !Array.isArray(flowData.steps)) {
      return res.status(400).json({ error: 'flowData.steps[] is required' });
    }
    const source = flowData.steps.find(s => s && s.type === 'source');
    if (!source || !source.table) {
      return res.status(400).json({ error: 'The report needs a source table' });
    }

    // Sanitize visual fields
    const safeColor = typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#3b82f6';
    const safeIcon = typeof icon === 'string' && /^[a-zA-Z]{1,30}$/.test(icon) ? icon : 'sparkles';

    const flow = await prisma.flow.create({
      data: {
        title: title.trim(),
        description: (description ?? '').trim().slice(0, 2000),
        tags: normalizeTags(tags),
        icon: safeIcon,
        color: safeColor,
        flowData,
        author: (author ?? '').trim().slice(0, 80) || 'Anonymous',
        stepCount: flowData.steps.length,
        featured: false,
      },
    });

    res.status(201).json(flow);
  } catch (err) {
    console.error('POST /api/hub/flows error:', err.message);
    res.status(500).json({ error: 'Failed to publish flow' });
  }
});

/**
 * POST /api/hub/flows/:id/download
 * Increments the download counter and returns the full flow data.
 */
app.post('/api/hub/flows/:id/download', async (req, res) => {
  try {
    const flow = await prisma.flow.update({
      where: { id: req.params.id },
      data: { downloads: { increment: 1 } },
    });
    res.json(flow);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Flow not found' });
    console.error('POST /api/hub/flows/:id/download error:', err.message);
    res.status(500).json({ error: 'Failed to update download count' });
  }
});

/**
 * POST /api/hub/flows/:id/execute
 * Increments the execution counter — fired when a user actually RUNs an
 * imported community report against their database. Returns the new count.
 */
app.post('/api/hub/flows/:id/execute', async (req, res) => {
  try {
    const flow = await prisma.flow.update({
      where: { id: req.params.id },
      data: { executions: { increment: 1 } },
      select: { id: true, executions: true },
    });
    res.json(flow);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Flow not found' });
    console.error('POST /api/hub/flows/:id/execute error:', err.message);
    res.status(500).json({ error: 'Failed to update execution count' });
  }
});

/**
 * DELETE /api/hub/flows/:id
 * Deletes a flow by id.
 */
app.delete('/api/hub/flows/:id', requireAdminKey, async (req, res) => {
  try {
    await prisma.flow.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Flow not found' });
    console.error('DELETE /api/hub/flows/:id error:', err.message);
    res.status(500).json({ error: 'Failed to delete flow' });
  }
});

/**
 * GET /api/hub/tags
 * Returns all unique tags across all flows, sorted alphabetically.
 */
app.get('/api/hub/tags', async (_req, res) => {
  try {
    const rows = await prisma.flow.findMany({ select: { tags: true } });
    const all = new Set();
    rows.forEach(r => parseTags(r.tags).forEach(t => all.add(t)));
    res.json([...all].sort());
  } catch (err) {
    console.error('GET /api/hub/tags error:', err.message);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

/**
 * GET /api/hub/stats
 * Aggregate community numbers for the gallery header.
 */
app.get('/api/hub/stats', async (_req, res) => {
  try {
    const [count, agg, authors] = await Promise.all([
      prisma.flow.count(),
      prisma.flow.aggregate({ _sum: { downloads: true, executions: true } }),
      prisma.flow.findMany({ select: { author: true }, distinct: ['author'] }),
    ]);
    res.json({
      flows: count,
      downloads: agg._sum.downloads || 0,
      executions: agg._sum.executions || 0,
      authors: authors.length,
    });
  } catch (err) {
    console.error('GET /api/hub/stats error:', err.message);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

/**
 * Register static-file serving + 404 / error handlers.
 *
 * MUST be called AFTER all route middleware (hub + bridge) has been mounted,
 * because the SPA catch-all and 404 handler must come last.
 */
export function registerFinalHandlers(expressApp) {
  // ── Static frontend (production) ────────────────────────────────────────
  const distDir = join(__dirname, '..', 'dist');
  if (existsSync(distDir)) {
    expressApp.use(express.static(distDir));
    // Express 5 removed bare `*` wildcard — use `/{*path}` for SPA fallback
    expressApp.get('/{*path}', (_req, res) => res.sendFile(join(distDir, 'index.html')));
  }

  // ── 404 + error handlers ─────────────────────────────────────────────────
  expressApp.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
  // eslint-disable-next-line no-unused-vars
  expressApp.use((err, _req, res, _next) => {
    console.error('Unhandled hub error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });
}

export { app, prisma };
