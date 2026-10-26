import { describe, it, expect } from 'vitest';
import { sanitizeFlow, sanitizeStep, sanitizeVar, hasSource, flowTooLarge, LIMITS } from '../lib/validate.js';

const id = () => 'x';

describe('sanitizeStep', () => {
  it('drops unknown / malformed steps', () => {
    expect(sanitizeStep(null, id)).toBeNull();
    expect(sanitizeStep({ type: 'evil' }, id)).toBeNull();
    expect(sanitizeStep('source', id)).toBeNull();
  });
  it('strips identifiers that contain bracket-breaking or control characters', () => {
    expect(sanitizeStep({ type: 'source', table: 'dbo.t]; DROP' }, id).table).toBe('');
    expect(sanitizeStep({ type: 'source', table: 'dbo.tArtikel' }, id).table).toBe('dbo.tArtikel');
    expect(sanitizeStep({ type: 'sort', by: 'Anzahl Aufträge', dir: 'up' }, id)).toEqual({ id: 'x', type: 'sort', by: 'Anzahl Aufträge', dir: 'desc' });
  });
  it('bounds arrays and coerces enums', () => {
    const conds = Array.from({ length: 50 }, () => ({ field: 'a.b.c', op: 'nope', value: 1 }));
    const s = sanitizeStep({ type: 'filter', conditions: conds }, id);
    expect(s.conditions.length).toBe(LIMITS.conditions);
    expect(s.conditions[0]).toEqual({ field: 'a.b.c', op: '=', value: '1' });
  });
  it('never trusts foreign ids', () => {
    expect(sanitizeStep({ id: 's101', type: 'columns', visible: ['a.b.c'] }, () => 'fresh').id).toBe('fresh');
  });
});

describe('sanitizeVar', () => {
  it('rejects names that are not identifiers and values that escape a SELECT', () => {
    expect(sanitizeVar({ name: 'zeit raum', value: '1' }, id)).toBeNull();
    expect(sanitizeVar({ name: 'x', value: '1; DROP TABLE y' }, id)).toBeNull();
    expect(sanitizeVar({ name: 'x', value: 'GETDATE() -- c' }, id)).toBeNull();
    expect(sanitizeVar({ name: 'x', value: 'INSERT INTO y' }, id)).toBeNull();
    expect(sanitizeVar({ name: 'x', value: '(SELECT 1 WAITFOR DELAY)' }, id)).toBeNull();
  });
  it('keeps ordinary date expressions', () => {
    expect(sanitizeVar({ name: 'zeitraum', value: 'DATEADD(day, -30, GETDATE())', label: 'L' }, id)).toEqual({ id: 'x', name: 'zeitraum', value: 'DATEADD(day, -30, GETDATE())', label: 'L' });
  });
});

describe('sanitizeFlow', () => {
  it('returns an empty flow for garbage', () => {
    expect(sanitizeFlow(null)).toEqual({ steps: [], vars: [] });
    expect(sanitizeFlow({ steps: 'x', vars: 3 })).toEqual({ steps: [], vars: [] });
  });
  it('collapses duplicate single-instance steps, orders source first and format last', () => {
    const f = sanitizeFlow({ steps: [
      { type: 'format', items: [] }, { type: 'filter', conditions: [] }, { type: 'source', table: 'a.b' },
      { type: 'filter', conditions: [] }, { type: 'join', table: 'c.d' }, { type: 'join', table: 'e.f' },
    ] });
    expect(f.steps.map(s => s.type)).toEqual(['source', 'filter', 'join', 'join', 'format']);
  });
  it('dedupes variables by name and assigns unique ids', () => {
    const f = sanitizeFlow({ steps: [], vars: [{ name: 'a', value: '1' }, { name: 'a', value: '2' }, { name: 'b', value: '3' }] });
    expect(f.vars.map(v => v.name)).toEqual(['a', 'b']);
    expect(new Set(f.vars.map(v => v.id)).size).toBe(2);
  });
  it('hasSource / flowTooLarge', () => {
    expect(hasSource({ steps: [{ type: 'source', table: '' }] })).toBe(false);
    expect(hasSource({ steps: [{ type: 'source', table: 'a.b' }] })).toBe(true);
    expect(flowTooLarge({ steps: [{ type: 'source', table: 'x'.repeat(LIMITS.flowBytes) }] })).toBe(true);
    expect(flowTooLarge({ steps: [] })).toBe(false);
  });
});
