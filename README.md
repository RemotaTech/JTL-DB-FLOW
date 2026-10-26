# JTL Workflow Creator

![DBFLOW](dbFlow.png)

[![Tests](https://github.com/RemotaTech/JTL-DB-FLOW/actions/workflows/test.yml/badge.svg)](https://github.com/RemotaTech/JTL-DB-FLOW/actions/workflows/test.yml)
[![License](https://img.shields.io/badge/license-Sustainable%20Use-blue)](LICENSE.md)

A **visual SQL query builder** for JTL-WAWI databases. Connect nodes together to construct complex SQL queries without writing a single line of code — then run them against your own MSSQL database.

Ships with a **Community Hub** where users can publish and discover shared workflows, backed by a PostgreSQL database via Prisma.

---

## Features

| Feature | Description |
|---|---|
| 🎨 **Visual editor** | Drag-and-drop node canvas (ReactFlow) |
| 🔗 **8 node types** | Table, Join, Filter, Sort, Aggregate, Column Selector, Distinct, Formatter |
| ⚡ **Live SQL preview** | Real-time SQL generation as you build |
| ▶️ **Query execution** | Run queries directly against your MSSQL database |
| 📊 **Results table** | Sortable preview table with CSV export |
| 💾 **Local library** | Save/load workflows in browser localStorage |
| 🌐 **Community Hub** | Browse, publish, and import community workflows |
| 🔒 **Browser-only credentials** | MSSQL credentials encrypted with AES-256-GCM; never leave the browser |
| 🗃️ **Multi-version schemas** | Supports JTL-WAWI 1.11.x through 2.x |

---

## Architecture

```
┌────────────────────────────────┐     ┌─────────────────────────────┐
│      React Frontend            │     │   Hub Server (port 3002)     │
│      (Vite, ReactFlow)         │────▶│   Express + Prisma + PG      │
│                                │     │   Community flow sharing      │
│  - Visual node editor          │     └─────────────────────────────┘
│  - SQL preview                 │
│  - Results table               │     ┌─────────────────────────────┐
│  - Settings (MSSQL config)     │────▶│   MSSQL Bridge (port 3001)  │
└────────────────────────────────┘     │   Express + mssql driver    │
                                       │   Per-request connection cfg  │
                                       └────────────┬────────────────┘
                                                    │
                                                    ▼
                                        Your MSSQL / JTL-WAWI DB
```

> **Security model:** MSSQL credentials are entered in the browser Settings panel, encrypted with AES-256-GCM using a key that lives only in `sessionStorage` (cleared when the tab closes), and stored as ciphertext in `localStorage`. They are sent with every query to the **bridge** — your own machine when running locally or self-hosted. On a hosted deployment that mounts the bridge on the hub, they travel to that server; the Settings dialog shows the exact target. The bridge only ever runs a single read-only `SELECT`, so a read-only SQL login is all it needs. See [SECURITY.md](SECURITY.md).

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
- `DATABASE_URL` — PostgreSQL connection string for the Community Hub (Neon, Supabase, Railway, local, etc.)
- `PORT` — Optional. MSSQL bridge port (default `3001`)
- `HUB_PORT` — Optional. Hub server port (default `3002`)
- `TRUST_PROXY` — Optional. Proxy hops in front of the hub (default `1` in production) so rate limits are per client IP
- `BRIDGE_ALLOW_PRIVATE_HOSTS` — Optional. Whether the bridge may target LAN/loopback SQL Servers (default: `true` locally + self-host, `false` on the production hub)
- `BRIDGE_CONNECT_TIMEOUT_MS` / `BRIDGE_REQUEST_TIMEOUT_MS` / `BRIDGE_MAX_ROWS` / `BRIDGE_MAX_SQL_LEN` / `BRIDGE_EXPORT_RATE_LIMIT` — Optional bridge limits (the last: schema exports per minute and IP, default `6`)
- `BRIDGE_SCHEMA_WRITE_DIR` — Optional. Folder where `POST /api/schema/export` stores `<version>.json` (set automatically in the desktop app). Unset → the schema is returned and the browser downloads it. Leave unset on public hubs

> **MSSQL credentials are NOT stored in `.env`.** They are entered in the browser Settings panel and kept encrypted in the browser. See [MSSQL Connection Settings](#mssql-connection-settings) below.

### 3. Set up the Hub database (PostgreSQL via Prisma)

```bash
# Generate Prisma client
npm run db:generate

# Push schema to your PostgreSQL database
npm run db:push
```

### 4. Start all services

```bash
# All at once (frontend + MSSQL bridge + Hub server)
npm run dev:all

# Or individually:
npm run dev          # Vite frontend  → http://localhost:5173
npm run server:dev   # MSSQL bridge  → http://localhost:3001
npm run hub:dev      # Hub server    → http://localhost:3002
```

Open [http://localhost:5173](http://localhost:5173)

---

## MSSQL Connection Settings

MSSQL credentials are **never** stored in `.env`. Configure them directly in the browser:

1. Click **SETTINGS** in the top navigation bar
2. Fill in the **MSSQL Verbindung** section:

| Field | Description |
|---|---|
| `DB_HOST` | Server hostname or IP address (e.g. `192.168.1.100`) |
| `DB_PORT` | TCP port — default `1433` |
| `DB_INSTANCE` | Named SQL Server instance (e.g. `SQLS`) — optional |
| `DB_NAME` | Database name — default `eazybusiness` |
| `DB_USER` | SQL Server login |
| `DB_PASS` | SQL Server password |

3. Click **Verbindung testen** to verify the connection
4. Click **Speichern** to save

### Named instance + known port

If your SQL Server uses a named instance (e.g. `SQLS`) **and** you know the TCP port, enter both. The bridge will connect directly to `host:port` and **skip SQL Server Browser Service** (UDP 1434). This avoids the 15-second Browser-Service timeout that occurs when UDP 1434 is blocked.

| Scenario | Behaviour |
|---|---|
| Port provided (any value) | Direct TCP to `host:port` — Browser Service **not** needed |
| Instance set, port empty | Browser Service resolution via UDP 1434 |
| No instance, port provided | Direct TCP to `host:port` |

### Security note

Credentials are stored as AES-256-GCM ciphertext in `localStorage`. The decryption key lives only in `sessionStorage` (in-memory, cleared on tab close). On a new browser session the key is gone, decryption fails gracefully, and you are prompted to re-enter credentials once. They are transmitted only to the bridge origin (local: `localhost:3001` / same origin) and never stored server-side. „Vergessen“ in the Settings dialog wipes them from the browser.

Bridge hardening (see `bridge/app.js`): SELECT-only gate, connection-descriptor validation, connect/request timeouts, row cap, per-IP rate limit, hashed pool keys, and an optional private-network block (`BRIDGE_ALLOW_PRIVATE_HOSTS`) for publicly hosted bridges.

---

## Desktop App (Electron)

The same UI, settings and features as the web build, packaged as a native app for macOS, Windows and Linux. No Node, no terminal, no `npm run server` — the MSSQL bridge runs inside the app on a random loopback port, so credentials never leave the machine.

```bash
npm run electron:dev        # Vite dev server + Electron with hot reload
npm run electron:start      # build dist/ and run the app from it
npm run electron:build      # installer for the current OS → release/
npm run electron:build:mac  # dmg + zip (arm64 + x64)
npm run electron:build:win  # NSIS installer + portable exe
npm run electron:build:linux# AppImage + deb
```

| What | Where |
|---|---|
| Main process | `electron/main.js` — window, menu, IPC, auto-update |
| Loopback server | `electron/server.js` — `dist/` + bridge routes on `127.0.0.1:<random>` |
| Schema updates | `electron/schemas.js` — import / download JTL schema JSONs |
| Renderer bridge | `electron/preload.cjs` — exposes `window.dbflow` (contextIsolation on, sandbox on) |
| Packaging | `electron-builder.yml`, icon in `build/` |

### Updating JTL schema files without a new app version

Bundled schemas (`versions/*.json`) ship with the app. Newer ones live in a per-user folder and take precedence:

| OS | Folder |
|---|---|
| macOS | `~/Library/Application Support/DBFLOW/versions/` |
| Windows | `%APPDATA%\DBFLOW\versions\` |
| Linux | `~/.config/DBFLOW/versions/` |

Three ways to add a version — all available under **Verbindung → JTL Wawi Version** and in the **Datei** menu:

1. **Schema importieren…** — pick any `<version>.json` (`{ "tables": [{ "name", "columns": [...] }] }`, same format as `versions/`). The file name (or a `"version"` field) becomes the label in the dropdown.
2. **Neue JTL-Versionen laden** — fetches every version on wawi-db.jtl-software.de that the app does not have yet (same procedure as `version-scraper.js`, progress shown as toasts).
3. **Ordner öffnen** — drop files in by hand. The dropdown refreshes immediately; no restart needed.

Deleting a file from that folder removes the version again (bundled versions cannot be removed).

### Desktop-only behaviour

- **Credentials survive restarts.** The AES-256-GCM key that protects the stored MSSQL credentials is kept via Electron `safeStorage` (macOS Keychain / Windows DPAPI / libsecret) instead of `sessionStorage`. „Vergessen“ removes key and ciphertext.
- **Community Hub** defaults to `https://db-flow.remotatech.com`. Override with the `DBFLOW_HUB_URL` env var or `{ "hubUrl": "https://…" }` in `<userData>/settings.json`.
- **App updates** are checked on start against GitHub Releases of `RemotaTech/JTL-DB-FLOW` (electron-updater, packaged builds only); **Nach Updates suchen…** is in the app menu. Publish a release with `npx electron-builder --publish always` and a `GH_TOKEN`.
- External links open in the system browser; the window never navigates away from the app.
- Builds are unsigned unless `CSC_LINK` / `CSC_KEY_PASSWORD` (and Apple notarization variables) are set in CI.

---

## Community Hub

The Hub lets you publish, browse, and import JTL workflows shared by the community.

### Browsing

- Click **Community** in the nav bar
- Search by keyword or filter by tag
- Click **Import** to load a workflow into the canvas

### Publishing

1. Build a workflow in the editor
2. Click **Community** → **Veröffentlichen**
3. Fill in title, description, and tags (semicolon-separated)
4. Click **Workflow veröffentlichen**

### Tags

Tags are **semicolon-separated** strings, e.g.:
```
sales;orders;customers;2024
```

### Using a shared hub vs. your own

`.env.example` defaults `VITE_HUB_URL` to our public hub at **[db-flow.remotatech.com](https://db-flow.remotatech.com)** — clone the repo, build, and you're browsing/publishing against a shared Postgres with no setup. Change it to your own hub's URL, or clear it (same-origin) if you're running the combined self-host image with your own `DATABASE_URL`.

Prefer full control over your data? Run your own hub — point `DATABASE_URL` at any Postgres instance (local, Neon, Supabase, Railway, Coolify) and leave `VITE_HUB_URL` empty. See [Quick Start](#quick-start).

A hosted hub is expected to sit behind:
- A global rate limiter (50 requests / min per IP) for browsing.
- A stricter limiter on publishing (10 flows / hour per IP) to curb spam.
- Destructive routes (e.g. deleting a flow) gated behind `HUB_ADMIN_KEY` — unset by default, i.e. disabled.

---

## Node Types

| Node | SQL Clause | Description |
|---|---|---|
| **Tabelle** | `FROM` | Select source table and columns |
| **Verknüpfung** | `JOIN` | INNER / LEFT / RIGHT join |
| **Filter** | `WHERE` | Column condition filter |
| **Sortierung** | `ORDER BY` | Sort columns ASC/DESC |
| **Aggregation** | `GROUP BY / HAVING` | Grouping with optional HAVING |
| **Spaltenauswahl** | `SELECT` | Pick specific columns with aliases |
| **Eindeutig** | `DISTINCT` | Remove duplicate rows |
| **Formatierung** | `CAST / CONVERT` | Format dates, numbers, strings |

---

## API Reference

### MSSQL Bridge (`localhost:3001`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/versions` | List available schema versions |
| `GET` | `/api/schema` | Get default schema |
| `GET` | `/api/schema/:version` | Get versioned schema |
| `POST` | `/api/query` | Execute a SELECT query |

**`POST /api/query` body:**
```json
{
  "sql": "SELECT TOP 10 * FROM [dbo].[tArtikel]",
  "connectionConfig": {
    "host": "192.168.1.100",
    "port": "1433",
    "instance": "SQLS",
    "user": "sa",
    "password": "secret",
    "database": "eazybusiness"
  }
}
```

`connectionConfig` is **required** and validated (host/port/instance/database format, length caps). Only a single read-only `SELECT`/`WITH` statement is accepted (403 otherwise). Rows are capped at `BRIDGE_MAX_ROWS` (default 5000; header `X-Rows-Truncated: 1` when cut). Errors come back as `{ error, code }` with a German user-facing message (`ELOGIN` → 401, `ETIMEOUT` → 504, `ESOCKET` → 502, `EREQUEST` → 400).

### `POST /api/schema/export`

Reads the table/column structure of the connected database (fixed catalog query, no user SQL) so a version that is not published on wawi-db.jtl-software.de can still be used. Body: `{ connectionConfig, version, overwrite? }`. With `BRIDGE_SCHEMA_WRITE_DIR` set it stores `<version>.json` and answers `{ saved: true, version, tables, columns }`; otherwise `{ saved: false, version, schema }`. `409 EXISTS` if the version is already known and `overwrite` is not set. In the UI: Settings → JTL Wawi Version → *Struktur aus Datenbank übernehmen*. CLI equivalent: `npm run export:schema`.

---

### Community Hub (`localhost:3002`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hub/health` | Health check |
| `GET` | `/api/hub/flows` | List flows (pagination, search, tag filter) |
| `GET` | `/api/hub/flows/:id` | Get a single flow with full node/edge data |
| `POST` | `/api/hub/flows` | Publish a new flow |
| `POST` | `/api/hub/flows/:id/download` | Increment download counter + return flow |
| `DELETE` | `/api/hub/flows/:id` | Delete a flow |
| `GET` | `/api/hub/tags` | All unique tags (sorted alphabetically) |

**`GET /api/hub/flows` query params:**

| Param | Type | Description |
|---|---|---|
| `search` | string | Full-text search across title / description / tags / author |
| `tags` | string | Semicolon-separated tag filter (OR logic) |
| `sort` | `downloads` \| `newest` | Sort order (default: `downloads`) |
| `page` | number | Page number (default: `1`) |
| `limit` | number | Page size, max 100 (default: `20`) |

---

## Testing

```bash
# Run all tests (watch mode)
npm test

# Single run — CI-friendly
npm run test:run

# Interactive browser UI
npm run test:ui

# With coverage report
npm run test:coverage
```

### Test suites

| File | Coverage |
|---|---|
| `src/__tests__/queryGenerator.test.js` | SQL generation from node graphs |
| `src/__tests__/nodeUtils.test.js` | Upstream column traversal helpers |
| `src/__tests__/server.test.js` | MSSQL bridge routes + `buildMssqlConfig` unit tests |
| `hub/tests/app.test.js` | Hub server API routes (Prisma fully mocked) |

---

## Database Management (Prisma)

```bash
# Push schema changes to DB (dev — no migration files)
npm run db:push

# Create and apply a migration (recommended for production)
npm run db:migrate

# Regenerate Prisma client after schema changes
npm run db:generate

# Open Prisma Studio (visual DB browser)
npm run db:studio
```

---

## Production Build

```bash
npm run build   # outputs to ./dist
```

For production deployment:

| Service | Command | Notes |
|---|---|---|
| Frontend | Serve `./dist` statically | Any static host / CDN |
| MSSQL bridge | `node server.js` | Must run on the **same machine** as the user's browser |
| Hub server | `node hub-server.js` | Any server with PostgreSQL access |

Set `DATABASE_URL` as an environment variable on the hub host. No MSSQL credentials belong in the server environment.

---

## Docker

Self-hosted image (frontend + MSSQL bridge + hub, all in one container). Build and run locally:

```bash
npm run docker:build
DATABASE_URL="postgresql://user:pass@host:5432/db" npm run docker:run
```

`DATABASE_URL` is required at runtime — it's the Community Hub's PostgreSQL connection string, not baked into the image. See [prisma/schema.prisma](prisma/schema.prisma).

---

## Project Structure

```
jtl-workflow-creator/
├── src/
│   ├── App.jsx                  # Main application
│   ├── components/
│   │   └── HubModal.jsx         # Community Hub modal
│   ├── lib/
│   │   ├── crypto.js            # AES-256-GCM credential encryption
│   │   └── utils.js             # Tailwind class helpers
│   ├── nodes/                   # ReactFlow node components
│   │   ├── TableNode.jsx
│   │   ├── JoinNode.jsx
│   │   ├── FilterNode.jsx
│   │   ├── SortNode.jsx
│   │   ├── AggregateNode.jsx
│   │   ├── ColumnSelectorNode.jsx
│   │   ├── DistinctNode.jsx
│   │   └── FormatterNode.jsx
│   ├── utils/
│   │   ├── queryGenerator.js    # Core SQL generation logic
│   │   └── nodeUtils.js         # Graph traversal helpers
│   └── __tests__/
│       ├── setup.js
│       ├── queryGenerator.test.js
│       ├── nodeUtils.test.js
│       └── server.test.js       # MSSQL bridge tests
├── hub/
│   ├── app.js                   # Hub Express app (exported for tests)
│   └── tests/
│       └── app.test.js
├── prisma/
│   └── schema.prisma            # PostgreSQL schema (Flows model)
├── versions/                    # JTL-WAWI schema JSON files per version
├── server.js                    # MSSQL bridge server
├── hub-server.js                # Hub server entry point
├── vite.config.js
├── vitest.config.js
├── .env.example
└── README.md
```

---

## License

Source-available under the [Sustainable Use License](LICENSE.md) — free for personal and internal commercial use (including building products/services on top of it). Reselling, redistributing, or offering it as a competing hosted service to third parties is not permitted. Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Maintained by

**[Remota Tech](https://remotatech.com)** — [info@remotatech.com](mailto:info@remotatech.com)
