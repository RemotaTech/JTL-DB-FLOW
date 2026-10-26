/**
 * version-scraper.js: only the pure selection/argument logic (no network).
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const { selectVersions, parseArgs, listLocalVersions, compareVersions } = await import('../../version-scraper.js');

const remote = ['1.11.0.0', '1.11.7.0', '2.0.0.0', '2.0.1.0', '2.1.0.0', '1.9.0.0', '../evil', 'x.y']
  .map(title => ({ title }));

describe('selectVersions', () => {
  it('returns only missing versions above the minimum, sorted ascending', () => {
    expect(selectVersions(remote, ['1.11.7.0', '2.0.0.0'])).toEqual(['2.0.1.0', '2.1.0.0']);
  });

  it('skips invalid titles (path traversal, garbage)', () => {
    const out = selectVersions(remote, []);
    expect(out).not.toContain('../evil');
    expect(out).not.toContain('x.y');
  });

  it('--force includes existing versions', () => {
    expect(selectVersions(remote, ['2.0.0.0'], { force: true })).toContain('2.0.0.0');
  });

  it('restricts to explicit versions', () => {
    expect(selectVersions(remote, [], { only: ['2.1.0.0'] })).toEqual(['2.1.0.0']);
  });

  it('numeric compare, not lexicographic', () => {
    expect(compareVersions('2.10.0.0', '2.9.0.0')).toBeGreaterThan(0);
  });
});

describe('parseArgs', () => {
  it('parses flags, dir and versions', () => {
    expect(parseArgs(['--dry-run', '--force', '--dir', 'out', '2.1.0.0']))
      .toEqual({ dryRun: true, force: true, dir: 'out', only: ['2.1.0.0'] });
  });

  it('defaults', () => {
    expect(parseArgs([])).toEqual({ dryRun: false, force: false, dir: './versions', only: [] });
  });

  it('rejects unknown args', () => {
    expect(() => parseArgs(['--nope'])).toThrow(/Unknown argument/);
  });
});

describe('listLocalVersions', () => {
  it('lists valid version files only; missing dir -> []', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vs-'));
    try {
      writeFileSync(join(dir, '2.0.0.0.json'), '{}');
      writeFileSync(join(dir, '2.0.1.0.json.tmp'), '{}');
      writeFileSync(join(dir, 'notes.json'), '{}');
      expect(listLocalVersions(dir)).toEqual(['2.0.0.0']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
    expect(listLocalVersions(join(dir, 'nope'))).toEqual([]);
  });
});
