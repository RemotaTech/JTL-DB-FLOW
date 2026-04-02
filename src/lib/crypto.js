/**
 * Browser-side AES-256-GCM encryption for MSSQL credentials.
 *
 * Strategy
 * ─────────
 * • A random AES-256-GCM key is generated once per browser session and kept
 *   in sessionStorage (memory only — cleared when the tab/browser closes).
 * • The encrypted blob is stored in localStorage (persists across refreshes).
 * • On a new session the key is gone → decryption fails → credentials reset
 *   → user re-enters once, the new session key encrypts and persists the blob.
 *
 * This means credentials at rest on disk (localStorage) are always ciphertext.
 * The decryption key never touches disk.
 */

const ALGO        = { name: 'AES-GCM', length: 256 };
const SESSION_KEY  = 'jtl_session_key';   // sessionStorage — in-memory, not on disk
const DB_CONFIG_KEY = 'jtl_db_config';    // localStorage  — encrypted blob

export const EMPTY_CONFIG = {
  host: '',
  port: '1433',
  instance: '',
  user: '',
  password: '',
  database: '',
};

// ─── Session key ───────────────────────────────────────────────────────────

/** Returns (and lazily creates) the AES-GCM CryptoKey for this browser session. */
async function getSessionKey() {
  const stored = sessionStorage.getItem(SESSION_KEY);

  if (stored) {
    try {
      const jwk = JSON.parse(stored);
      return await crypto.subtle.importKey('jwk', jwk, ALGO, false, ['encrypt', 'decrypt']);
    } catch {
      // Corrupt JWK — fall through and generate a new key
      sessionStorage.removeItem(SESSION_KEY);
    }
  }

  // Generate a new 256-bit key for this session
  const key = await crypto.subtle.generateKey(ALGO, true, ['encrypt', 'decrypt']);
  const jwk = await crypto.subtle.exportKey('jwk', key);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(jwk));
  return key;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Encrypt a config object and store it in localStorage.
 * @param {typeof EMPTY_CONFIG} config
 */
export async function saveDbConfig(config) {
  const key     = await getSessionKey();
  const iv      = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV
  const encoded = new TextEncoder().encode(JSON.stringify(config));

  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  const blob = JSON.stringify({
    iv:   bufToBase64(iv),
    data: bufToBase64(cipherBuf),
  });

  localStorage.setItem(DB_CONFIG_KEY, blob);
}

/**
 * Load and decrypt the config from localStorage.
 * Returns EMPTY_CONFIG if nothing is stored or if decryption fails
 * (e.g. new browser session — key no longer in sessionStorage).
 * @returns {Promise<typeof EMPTY_CONFIG>}
 */
export async function loadDbConfig() {
  const raw = localStorage.getItem(DB_CONFIG_KEY);
  if (!raw) return { ...EMPTY_CONFIG };

  try {
    const { iv: ivB64, data: dataB64 } = JSON.parse(raw);
    const key      = await getSessionKey();
    const iv       = base64ToBuf(ivB64);
    const data     = base64ToBuf(dataB64);

    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
    const parsed   = JSON.parse(new TextDecoder().decode(plainBuf));

    // Merge with EMPTY_CONFIG so new fields added later default gracefully
    return { ...EMPTY_CONFIG, ...parsed };
  } catch {
    // New session (key mismatch) or corrupt blob — clear and start fresh
    localStorage.removeItem(DB_CONFIG_KEY);
    return { ...EMPTY_CONFIG };
  }
}

/**
 * Remove stored credentials entirely.
 */
export function clearDbConfig() {
  localStorage.removeItem(DB_CONFIG_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}
