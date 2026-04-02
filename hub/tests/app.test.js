/**
 * Hub server route tests.
 * Prisma client is mocked — no real DB connection required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ── Mock @prisma/client BEFORE importing app ───────────────────────────────
// vi.hoisted ensures the mock object exists before vi.mock() factory runs.

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    flow: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    $disconnect: vi.fn(),
  };
  return { mockPrisma };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    constructor() {
      // Return the shared mock so tests can call `.mockResolvedValue` etc.
      return mockPrisma;
    }
  },
}));

// Import app after mock is set up
const { app } = await import('../app.js');

// Clear all mock call histories before every test so call indices are fresh
beforeEach(() => { vi.clearAllMocks(); });

// ─── Sample fixture ────────────────────────────────────────────────────────

const sampleFlow = {
  id: 'cuid123',
  title: 'Test Workflow',
  description: 'A test flow',
  tags: 'sales;orders',
  flowData: { nodes: [{ id: 'n1', type: 'tableNode' }], edges: [] },
  author: 'Alice',
  downloads: 5,
  nodeCount: 1,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-02'),
};

// ─── /api/hub/health ───────────────────────────────────────────────────────

describe('GET /api/hub/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/hub/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });
});

// ─── GET /api/hub/flows ────────────────────────────────────────────────────

describe('GET /api/hub/flows', () => {
  beforeEach(() => {
    mockPrisma.flow.findMany.mockResolvedValue([sampleFlow]);
    mockPrisma.flow.count.mockResolvedValue(1);
  });

  it('returns 200 with flows array and pagination', async () => {
    const res = await request(app).get('/api/hub/flows');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.flows)).toBe(true);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBe(1);
  });

  it('passes search param to prisma query', async () => {
    mockPrisma.flow.findMany.mockResolvedValue([]);
    mockPrisma.flow.count.mockResolvedValue(0);
    await request(app).get('/api/hub/flows?search=sales');
    const callArg = mockPrisma.flow.findMany.mock.calls.at(-1)[0];
    expect(JSON.stringify(callArg.where)).toContain('sales');
  });

  it('passes tags filter to prisma query', async () => {
    mockPrisma.flow.findMany.mockResolvedValue([]);
    mockPrisma.flow.count.mockResolvedValue(0);
    await request(app).get('/api/hub/flows?tags=orders;customers');
    const callArg = mockPrisma.flow.findMany.mock.calls.at(-1)[0];
    expect(JSON.stringify(callArg.where)).toContain('orders');
  });

  it('limits page size to 100 at most', async () => {
    mockPrisma.flow.findMany.mockResolvedValue([]);
    mockPrisma.flow.count.mockResolvedValue(0);
    await request(app).get('/api/hub/flows?limit=999');
    const callArg = mockPrisma.flow.findMany.mock.calls.at(-1)[0];
    expect(callArg.take).toBeLessThanOrEqual(100);
  });

  it('returns 500 on DB error', async () => {
    mockPrisma.flow.findMany.mockRejectedValue(new Error('DB down'));
    const res = await request(app).get('/api/hub/flows');
    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });
});

// ─── GET /api/hub/flows/:id ────────────────────────────────────────────────

describe('GET /api/hub/flows/:id', () => {
  it('returns 200 with flow data', async () => {
    mockPrisma.flow.findUnique.mockResolvedValue(sampleFlow);
    const res = await request(app).get('/api/hub/flows/cuid123');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('cuid123');
    expect(res.body.title).toBe('Test Workflow');
  });

  it('returns 404 when flow not found', async () => {
    mockPrisma.flow.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/hub/flows/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Flow not found');
  });
});

// ─── POST /api/hub/flows ───────────────────────────────────────────────────

describe('POST /api/hub/flows', () => {
  const validBody = {
    title: 'My Workflow',
    description: 'Sells stuff',
    tags: 'sales;orders',
    flowData: { nodes: [{ id: 'n1' }], edges: [] },
    author: 'Bob',
  };

  beforeEach(() => {
    mockPrisma.flow.create.mockResolvedValue({ ...sampleFlow, ...validBody, id: 'new-id' });
  });

  it('creates a flow and returns 201', async () => {
    const res = await request(app).post('/api/hub/flows').send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('My Workflow');
  });

  it('returns 400 when title is missing', async () => {
    const res = await request(app).post('/api/hub/flows').send({ ...validBody, title: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/i);
  });

  it('returns 400 when flowData is missing', async () => {
    const res = await request(app).post('/api/hub/flows').send({ title: 'Test' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/flowData/i);
  });

  it('returns 400 when flowData has no nodes array', async () => {
    const res = await request(app).post('/api/hub/flows').send({
      title: 'Test',
      flowData: { notNodes: true },
    });
    expect(res.status).toBe(400);
  });

  it('normalizes tags to lowercase semicolon-separated', async () => {
    await request(app).post('/api/hub/flows').send({
      ...validBody,
      tags: 'Sales; Orders ;CUSTOMERS',
    });
    const createArg = mockPrisma.flow.create.mock.calls.at(-1)[0];
    expect(createArg.data.tags).toBe('sales;orders;customers');
  });

  it('defaults author to Anonymous when not provided', async () => {
    await request(app).post('/api/hub/flows').send({
      title: 'No Author',
      flowData: { nodes: [], edges: [] },
    });
    const createArg = mockPrisma.flow.create.mock.calls.at(-1)[0];
    expect(createArg.data.author).toBe('Anonymous');
  });

  it('returns 400 when title exceeds 120 chars', async () => {
    const res = await request(app)
      .post('/api/hub/flows')
      .send({ ...validBody, title: 'a'.repeat(121) });
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/hub/flows/:id/download ─────────────────────────────────────

describe('POST /api/hub/flows/:id/download', () => {
  it('increments download count and returns updated flow', async () => {
    const updated = { ...sampleFlow, downloads: 6 };
    mockPrisma.flow.update.mockResolvedValue(updated);
    const res = await request(app).post('/api/hub/flows/cuid123/download');
    expect(res.status).toBe(200);
    expect(res.body.downloads).toBe(6);
  });

  it('returns 404 when flow not found', async () => {
    const err = new Error('Not found');
    err.code = 'P2025';
    mockPrisma.flow.update.mockRejectedValue(err);
    const res = await request(app).post('/api/hub/flows/bad-id/download');
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /api/hub/flows/:id ─────────────────────────────────────────────

describe('DELETE /api/hub/flows/:id', () => {
  it('deletes a flow and returns success', async () => {
    mockPrisma.flow.delete.mockResolvedValue(sampleFlow);
    const res = await request(app).delete('/api/hub/flows/cuid123');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 404 when flow not found', async () => {
    const err = new Error('Not found');
    err.code = 'P2025';
    mockPrisma.flow.delete.mockRejectedValue(err);
    const res = await request(app).delete('/api/hub/flows/bad-id');
    expect(res.status).toBe(404);
  });
});

// ─── GET /api/hub/tags ─────────────────────────────────────────────────────

describe('GET /api/hub/tags', () => {
  it('returns sorted unique tags', async () => {
    mockPrisma.flow.findMany.mockResolvedValue([
      { tags: 'sales;orders' },
      { tags: 'customers;sales' },
      { tags: '' },
    ]);
    const res = await request(app).get('/api/hub/tags');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(['customers', 'orders', 'sales']);
  });

  it('returns empty array when no flows exist', async () => {
    mockPrisma.flow.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/hub/tags');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ─── 404 catch-all ────────────────────────────────────────────────────────

describe('Unknown routes', () => {
  it('returns 404 for unknown route', async () => {
    const res = await request(app).get('/api/hub/does-not-exist-xyz');
    expect(res.status).toBe(404);
  });
});
