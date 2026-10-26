/**
 * Tiny fetch wrapper: timeouts, safe JSON parsing, German error messages.
 *
 * `fetchJson` never throws on HTTP errors — it resolves to
 *   { ok, status, data, error, headers }
 * so callers can branch on `ok` without try/catch soup. Network failures and
 * timeouts resolve with `ok:false, status:0` and a human message.
 */

const DEFAULT_TIMEOUT = 20_000;

export function messageForStatus(status, data) {
  const serverMsg = data && typeof data === 'object' && typeof data.error === 'string' ? data.error : null;
  switch (status) {
    case 0:   return 'Keine Verbindung zum Server.';
    case 400: return serverMsg || 'Ungültige Anfrage.';
    case 401: return serverMsg || 'Anmeldung fehlgeschlagen.';
    case 403: return serverMsg || 'Nicht erlaubt.';
    case 404: return serverMsg || 'Nicht gefunden.';
    case 413: return serverMsg || 'Anfrage zu groß.';
    case 429: return 'Zu viele Anfragen — bitte einen Moment warten.';
    case 502: case 503: return serverMsg || 'Server nicht erreichbar (502/503).';
    case 504: return serverMsg || 'Zeitüberschreitung beim Server.';
    default:  return serverMsg || `Fehler ${status}.`;
  }
}

export async function fetchJson(url, opts = {}, { timeoutMs = DEFAULT_TIMEOUT, signal } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs);
  const onOuter = () => ctrl.abort(signal?.reason);
  if (signal) { if (signal.aborted) onOuter(); else signal.addEventListener('abort', onOuter, { once: true }); }

  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const text = await res.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch { data = null; } }
    const ok = res.ok && (data !== null || text === '');
    return {
      ok, status: res.status, data, headers: res.headers,
      error: ok ? null : (res.ok ? 'Unerwartete Antwort vom Server (kein JSON).' : messageForStatus(res.status, data)),
      code: data && typeof data === 'object' ? data.code : undefined,
    };
  } catch (err) {
    const aborted = err?.name === 'AbortError' || err?.name === 'TimeoutError' || ctrl.signal.aborted;
    const byUser = aborted && signal?.aborted;
    return {
      ok: false, status: 0, data: null, headers: null,
      error: byUser ? 'Abgebrochen.' : aborted ? 'Zeitüberschreitung — der Server hat nicht rechtzeitig geantwortet.' : 'Keine Verbindung zum Server.',
      aborted: byUser,
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onOuter);
  }
}

export const postJson = (url, body, extra) =>
  fetchJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, extra);
