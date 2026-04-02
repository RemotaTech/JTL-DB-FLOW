# JTL Workflow Creator

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

> **Security model:** MSSQL credentials are entered in the browser Settings panel, encrypted with AES-256-GCM using a key that lives only in `sessionStorage` (cleared when the tab closes), and stored as ciphertext in `localStorage`. Credentials are sent exclusively to `localhost:3001` — never to the Hub or any external server.

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

Credentials are stored as AES-256-GCM ciphertext in `localStorage`. The decryption key lives only in `sessionStorage` (in-memory, cleared on tab close). On a new browser session the key is gone, decryption fails gracefully, and you are prompted to re-enter credentials once. They are transmitted exclusively to `localhost:3001` (your own machine) and **never** to the Community Hub.

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

`connectionConfig` is **required**. Credentials are supplied from the browser Settings panel and only sent to `localhost:3001`.

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

ISC
