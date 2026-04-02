/**
 * Browser-side encryption for MSSQL credentials.
 *
 * Strategy
 * ─────────
 * HTTPS / localhost  →  AES-256-GCM via WebCrypto (crypto.subtle)
 *   • A random AES-256-GCM key is generated once per browser session and kept
 *     in sessionStorage (in-memory, cleared when the tab closes).
 *   • The encrypted blob is stored in localStorage (always ciphertext on disk).
 *
 * HTTP (insecure origin)  →  XOR-obfuscation fallback
 *   • crypto.subtle is blocked by browsers on plain HTTP.
 *   • We fall back to XOR with a random 32-byte session key (crypto.getRandomValues
 *     IS available on HTTP). Not real encryption, but credentials are never stored
 *     as plaintext. A warning is surfaced in the UI.
 *
 * In both modes the decryption key only lives in sessionStorage — it is never
 * written to disk and is wiped when the browser session ends.
 */

const ALGO            = { name: 'AES-GCM', length: 256 };
const SESSION_KEY     = 'jtl_session_key';       // sessionStorage
const SESSION_KEY_FB  = 'jtl_session_key_fb';    // sessionStorage (fallback)
const DB_CONFIG_KEY   = 'jtl_db_config';         // localStorage

/** True when WebCrypto subtle is available (HTTPS or localhost). */
export const isSecureContext = () =>
  typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';

export const EMPTY_CONFIG = {
  host:     '',
  port:     '1433',
  instance: '',
  user:     '',
  password: '',
  database: '',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

// ─── AES-GCM path (HTTPS / localhost) ────────────────────────────────────────

async function getAesKey() {
  const stored = sessionStorage.getItem(SESSION_KEY);
  if (stored) {
    try {
      const jwk = JSON.parse(stored);
      return await crypto.subtle.importKey('jwk', jwk, ALGO, false, ['encrypt', 'decrypt']);
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }
  const key = await crypto.subtle.generateKey(ALGO, true, ['encrypt', 'decrypt']);
  const jwk = await crypto.subtle.exportKey('jwk', key);
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(jwk));
  return key;
}

async function encryptAes(plaintext) {
  const key       = await getAesKey();
  const iv        = crypto.getRandomValues(new Uint8Array(12));
  const encoded   = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return JSON.stringify({ mode: 'aes', iv: bufToBase64(iv), data: bufToBase64(cipherBuf) });
}

async function decryptAes(blob) {
  const { iv: ivB64, data: dataB64 } = JSON.parse(blob);
  const key      = await getAesKey();
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBuf(ivB64) },
    key,
    base64ToBuf(dataB64),
  );
  return new TextDecoder().decode(plainBuf);
}

// ─── XOR-obfuscation fallback (HTTP) ─────────────────────────────────────────

function getXorKey() {
  const stored = sessionStorage.getItem(SESSION_KEY_FB);
  if (stored) return base64ToBuf(stored);
  const key = crypto.getRandomValues(new Uint8Array(32));
  sessionStorage.setItem(SESSION_KEY_FB, bufToBase64(key));
  return key;
}

function encryptXor(plaintext) {
  const key     = getXorKey();
  const encoded = new TextEncoder().encode(plaintext);
  const result  = new Uint8Array(encoded.length);
  for (let i = 0; i < encoded.length; i++) result[i] = encoded[i] ^ key[i % key.length];
  return JSON.stringify({ mode: 'xor', data: bufToBase64(result) });
}

function decryptXor(blob) {
  const { data } = JSON.parse(blob);
  const key    = getXorKey();
  const cipher = base64ToBuf(data);
  const result = new Uint8Array(cipher.length);
  for (let i = 0; i < cipher.length; i++) result[i] = cipher[i] ^ key[i % key.length];
  return new TextDecoder().decode(result);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Encrypt a config object and persist it in localStorage.
 * Uses AES-256-GCM on HTTPS; XOR-obfuscation on HTTP.
 */
export async function saveDbConfig(config) {
  const plaintext = JSON.stringify(config);
  const blob = isSecureContext()
    ? await encryptAes(plaintext)
    : encryptXor(plaintext);
  localStorage.setItem(DB_CONFIG_KEY, blob);
}

/**
 * Load and decrypt the stored config.
 * Returns EMPTY_CONFIG if nothing is stored or decryption fails.
 */
export async function loadDbConfig() {
  const raw = localStorage.getItem(DB_CONFIG_KEY);
  if (!raw) return { ...EMPTY_CONFIG };

  try {
    const parsed = JSON.parse(raw);

    let plaintext;
    if (parsed.mode === 'aes') {
      // Stored with AES — requires secure context to decrypt
      if (!isSecureContext()) {
        // Can't decrypt AES blob without crypto.subtle — clear and start fresh
        localStorage.removeItem(DB_CONFIG_KEY);
        return { ...EMPTY_CONFIG };
      }
      plaintext = await decryptAes(raw);
    } else if (parsed.mode === 'xor') {
      plaintext = decryptXor(raw);
    } else {
      // Legacy format (no mode field) — treat as AES attempt
      plaintext = isSecureContext() ? await decryptAes(raw) : null;
      if (!plaintext) {
        localStorage.removeItem(DB_CONFIG_KEY);
        return { ...EMPTY_CONFIG };
      }
    }

    return { ...EMPTY_CONFIG, ...JSON.parse(plaintext) };
  } catch {
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
  sessionStorage.removeItem(SESSION_KEY_FB);
}
