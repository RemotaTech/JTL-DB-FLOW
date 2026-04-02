import { describe, it, expect, beforeEach } from 'vitest';
import { saveDbConfig, loadDbConfig, clearDbConfig, EMPTY_CONFIG } from '../lib/crypto';

// jsdom 25 + Node 18+ expose crypto.subtle — no polyfill needed.

const sampleConfig = {
  host: '192.168.1.100',
  port: '1433',
  instance: 'SQLS',
  user: 'sa',
  password: 's3cr3t!',
  database: 'eazybusiness',
};

// Clear all storage state before each test so tests are independent
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('saveDbConfig / loadDbConfig', () => {
  it('saves and loads a config round-trip correctly', async () => {
    await saveDbConfig(sampleConfig);
    const loaded = await loadDbConfig();
    expect(loaded).toEqual(sampleConfig);
  });

  it('stores an encrypted blob in localStorage (not plaintext)', async () => {
    await saveDbConfig(sampleConfig);
    const raw = localStorage.getItem('jtl_db_config');
    expect(raw).not.toBeNull();
    // The raw value must not contain the plaintext password
    expect(raw).not.toContain('s3cr3t!');
    // Must not contain plaintext host
    expect(raw).not.toContain('192.168.1.100');
    // Must be valid JSON with iv + data fields (base64 strings, not plain objects)
    const parsed = JSON.parse(raw);
    expect(parsed).toHaveProperty('iv');
    expect(parsed).toHaveProperty('data');
    expect(typeof parsed.iv).toBe('string');
    expect(typeof parsed.data).toBe('string');
  });

  it('uses a different IV on every save (AES-GCM nonce)', async () => {
    await saveDbConfig(sampleConfig);
    const blob1 = localStorage.getItem('jtl_db_config');

    await saveDbConfig(sampleConfig);
    const blob2 = localStorage.getItem('jtl_db_config');

    const iv1 = JSON.parse(blob1).iv;
    const iv2 = JSON.parse(blob2).iv;
    expect(iv1).not.toBe(iv2); // Different nonces every time
  });

  it('returns EMPTY_CONFIG when localStorage is empty', async () => {
    const loaded = await loadDbConfig();
    expect(loaded).toEqual(EMPTY_CONFIG);
  });

  it('returns EMPTY_CONFIG and clears storage when the session key is missing', async () => {
    await saveDbConfig(sampleConfig);
    // Simulate a new browser session: session key is gone but blob remains
    sessionStorage.clear();
    const loaded = await loadDbConfig();
    expect(loaded).toEqual(EMPTY_CONFIG);
    // Corrupt/undecryptable blob must be purged
    expect(localStorage.getItem('jtl_db_config')).toBeNull();
  });

  it('returns EMPTY_CONFIG and clears storage when the blob is corrupt', async () => {
    localStorage.setItem('jtl_db_config', 'not-valid-json-{{{');
    const loaded = await loadDbConfig();
    expect(loaded).toEqual(EMPTY_CONFIG);
    expect(localStorage.getItem('jtl_db_config')).toBeNull();
  });

  it('merges missing fields with EMPTY_CONFIG defaults (forward compatibility)', async () => {
    // Simulate an older saved config that lacks the `database` field
    const oldConfig = { host: '10.0.0.1', port: '1433', instance: '', user: 'admin', password: 'pw' };
    await saveDbConfig(oldConfig);
    const loaded = await loadDbConfig();
    // New field `database` must default to empty string rather than undefined
    expect(loaded.database).toBe('');
    expect(loaded.host).toBe('10.0.0.1');
  });

  it('persists the same session key across multiple saves within one session', async () => {
    await saveDbConfig(sampleConfig);
    const key1 = sessionStorage.getItem('jtl_session_key');

    await saveDbConfig({ ...sampleConfig, host: '10.0.0.2' });
    const key2 = sessionStorage.getItem('jtl_session_key');

    expect(key1).toBe(key2); // Same session key re-used
  });
});

describe('clearDbConfig', () => {
  it('removes both the blob and the session key', async () => {
    await saveDbConfig(sampleConfig);
    expect(localStorage.getItem('jtl_db_config')).not.toBeNull();
    expect(sessionStorage.getItem('jtl_session_key')).not.toBeNull();

    clearDbConfig();

    expect(localStorage.getItem('jtl_db_config')).toBeNull();
    expect(sessionStorage.getItem('jtl_session_key')).toBeNull();
  });

  it('loadDbConfig returns EMPTY_CONFIG after clear', async () => {
    await saveDbConfig(sampleConfig);
    clearDbConfig();
    const loaded = await loadDbConfig();
    expect(loaded).toEqual(EMPTY_CONFIG);
  });
});

describe('EMPTY_CONFIG', () => {
  it('has all required fields', () => {
    expect(EMPTY_CONFIG).toMatchObject({
      host: '',
      port: '1433',
      instance: '',
      user: '',
      password: '',
      database: '',
    });
  });
});
