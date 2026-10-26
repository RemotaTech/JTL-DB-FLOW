# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, **do not open a public issue**. Instead, report it privately via GitHub's [Security Advisories](../../security/advisories/new) for this repo, or contact **Remota Tech** directly at [info@remotatech.com](mailto:info@remotatech.com).

Please include:
- A description of the vulnerability and its impact
- Steps to reproduce
- Any relevant logs or proof-of-concept code

You should receive a response within a few days. We'll work with you to understand and address the issue before any public disclosure.

## Scope notes

- **Credentials.** MSSQL credentials are entered in the browser, encrypted client-side (AES-256-GCM; key in `sessionStorage`) and stored only in that browser. They are transmitted with every query to whichever origin hosts the *bridge*: your own machine when running locally or self-hosted, or the hub server when using a hosted deployment that mounts the bridge. The Settings dialog states the target explicitly. Use a **read-only** SQL login.
- **Bridge guards.** `POST /api/query` accepts a single read-only `SELECT`/`WITH` statement only (no `;`, no DML/DDL/EXEC/`INTO`/`WAITFOR`/`sp_`/`xp_`), validates the connection descriptor, applies connect/request timeouts, caps rows (`BRIDGE_MAX_ROWS`) and rate-limits per IP. Connection pools are keyed by a SHA-256 hash; passwords never appear in logs.
- **Private-network policy.** A publicly hosted bridge refuses loopback/LAN/link-local targets by default (`BRIDGE_ALLOW_PRIVATE_HOSTS=false`), so it cannot be used to probe its own network. Local and self-hosted entry points allow them. This is a literal-IP check; hostnames are not resolved.
- **Hub input.** Published flows are validated and sanitised server-side (`src/lib/validate.js`): unknown steps dropped, identifiers/literals bounded, variable values that could escape a `SELECT` rejected, payload size capped. The frontend re-sanitises on import.
- **Do not** expose `server.js` (standalone bridge) to the public internet without adding your own auth layer.
