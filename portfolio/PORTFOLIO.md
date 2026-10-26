# DBFLOW — JTL Report Builder

> Portfolio hand-off for remotatech.com. Everything a coding agent needs to build the project page: copy (EN + DE), facts, screenshots with captions and alt text, links, tags.

---

## 1. Quick facts

| | |
|---|---|
| **Product name** | DBFLOW (repo name: JTL-DB-FLOW / jtl-workflow-creator) |
| **One-liner (EN)** | A no-code report builder for JTL-Wawi: assemble a step pipeline, get read-only T-SQL, run it against your own MSSQL, share it with the community. |
| **One-liner (DE)** | No-Code-Berichtsgenerator für JTL-Wawi: Schritte zusammenklicken, sicheres T-SQL erhalten, direkt auf der eigenen MSSQL-Datenbank ausführen, mit der Community teilen. |
| **Category** | Developer tool / Business intelligence / E-commerce (JTL ecosystem) |
| **Status** | Live, open source (source-available, Sustainable Use License) |
| **Live app** | https://db-flow.remotatech.com |
| **Source** | https://github.com/RemotaTech/JTL-DB-FLOW |
| **Maintainer** | Remota Tech — info@remotatech.com |
| **UI language** | German |
| **Year** | 2025–2026 |

---

## 2. Portfolio copy

### Short card text (EN, ~40 words)

DBFLOW turns JTL-Wawi reporting into a guided pipeline: pick a source table, add joins, filters, grouping and sorting, and DBFLOW generates safe, read-only T-SQL and runs it live against your MSSQL server. Save reports locally or publish them to a community hub.

### Short card text (DE, ~40 Wörter)

DBFLOW macht Auswertungen aus JTL-Wawi zur geführten Pipeline: Quelltabelle wählen, Verknüpfungen, Filter, Gruppierung und Sortierung hinzufügen — DBFLOW erzeugt sicheres, rein lesendes T-SQL und führt es live auf dem eigenen MSSQL-Server aus. Berichte lokal speichern oder im Community-Hub veröffentlichen.

### Long description (EN)

**The problem.** JTL-Wawi stores everything a merchant needs to know in an MSSQL database with hundreds of tables, but getting a simple answer out of it ("which orders were cancelled last month?") means either writing SQL by hand or paying for a BI tool. Most shop owners do neither.

**The solution.** DBFLOW replaces the SQL editor with a linear step pipeline. Every report is a chain of small, understandable steps: *Source → Join → Filter → Group → Sort → Columns → Format*. Each step is a card with plain-language controls that only offer valid choices (join keys come from known JTL relationships, columns come from the selected tables, filters can reference named variables like `@zeitraum`). The generated SQL is always visible and copyable, so the tool teaches as it works.

**Run it on your data, keep your credentials.** Queries execute through a small bridge service against the user's own MSSQL server. Credentials are entered in the browser, encrypted with AES-256-GCM, and never written to any server. The bridge accepts a single `SELECT` statement only, enforces row caps, timeouts and rate limits, and can be locked to refuse private-network targets when hosted publicly. A read-only SQL login is all a user needs.

**Start fast, share what works.** Six built-in templates cover common questions (newest orders, cancelled orders, orders per customer, articles by manufacturer, order positions, articles above a price). A Community Hub lets anyone publish a report definition (structure only, never data or credentials) and lets others import it with one click, with download and execution counters, tags, search and featured picks.

**Built for self-hosting.** One Docker image ships the frontend, the MSSQL bridge and the hub. Point it at any Postgres and you have a private DBFLOW for your team.

### Long description (DE)

**Das Problem.** JTL-Wawi legt alles, was ein Händler wissen möchte, in einer MSSQL-Datenbank mit hunderten Tabellen ab. Eine einfache Antwort herauszuholen („Welche Aufträge wurden letzten Monat storniert?") bedeutet aber entweder SQL von Hand zu schreiben oder ein BI-Tool zu bezahlen. Die meisten Shop-Betreiber tun keines von beidem.

**Die Lösung.** DBFLOW ersetzt den SQL-Editor durch eine lineare Schritt-Pipeline. Jeder Bericht ist eine Kette kleiner, verständlicher Schritte: *Quelle → Verknüpfung → Filter → Gruppierung → Sortierung → Spalten → Formatierung*. Jeder Schritt ist eine Karte mit klaren Bedienelementen, die nur gültige Optionen anbieten (Join-Schlüssel stammen aus bekannten JTL-Beziehungen, Spalten aus den gewählten Tabellen, Filter können benannte Variablen wie `@zeitraum` verwenden). Das erzeugte SQL ist jederzeit sichtbar und kopierbar.

**Eigene Daten, eigene Zugangsdaten.** Abfragen laufen über einen kleinen Bridge-Dienst gegen den MSSQL-Server des Nutzers. Zugangsdaten werden im Browser eingegeben, mit AES-256-GCM verschlüsselt und nie serverseitig gespeichert. Die Bridge akzeptiert ausschließlich ein einzelnes `SELECT`, begrenzt Zeilen, Laufzeit und Anfragen pro IP und kann bei öffentlichem Hosting private Netzwerkziele verweigern. Ein lesender SQL-Benutzer genügt.

**Schnell starten, Gutes teilen.** Sechs Vorlagen decken typische Fragen ab. Über den Community-Hub veröffentlicht man Berichtsdefinitionen (nur Struktur, nie Daten oder Zugangsdaten), andere importieren sie mit einem Klick — mit Download- und Ausführungszählern, Tags, Suche und Empfehlungen.

**Self-Hosting inklusive.** Ein Docker-Image enthält Frontend, MSSQL-Bridge und Hub. Eine Postgres-URL genügt für eine private DBFLOW-Instanz im eigenen Team.

---

## 3. Feature list

- **Linear step pipeline** instead of a node canvas: Source, Join (multiple), Filter, Group/Having, Sort, Columns, Format. Steps are inserted in a valid order automatically.
- **Live T-SQL generation** with syntax highlighting, copy button and `SELECT TOP` row limit.
- **Schema-aware controls**: tables, columns and join relationships come from versioned JTL-Wawi schema files (1.11.x through 2.x).
- **Named variables** (`@zeitraum` etc.) usable inside filters, e.g. `DATEADD(day, -30, GETDATE())`.
- **Query execution** against the user's MSSQL with sortable results table and CSV export (with formula-injection protection).
- **Templates** for six common JTL reports, opened and run with one click.
- **Local library** with autosaved draft, unsaved-changes guard, keyboard shortcuts (⌘/Ctrl+Enter run, ⌘/Ctrl+S save).
- **Community Hub**: featured, most downloaded, most executed; search, tags, pagination; publish with icon and colour.
- **Browser-only credentials**: AES-256-GCM, key in `sessionStorage`, ciphertext in `localStorage`, "Forget" button, honest badge that says where credentials are sent.
- **Hardened bridge**: SELECT-only gate, connection-descriptor validation, timeouts, row cap, per-IP rate limit, optional private-host block, hashed pool keys.
- **Hub hardening**: shared validator for published flows, rate limits on browsing and publishing, admin-key-gated deletes, CORS allowlist.
- **Responsive**: works at phone width (see mobile screenshots).
- **Self-host**: single Docker image, `docker-compose`, or three separate Node processes.
- **Tests**: Vitest suites for SQL generation, validator, bridge routes and hub routes (mssql and Prisma mocked); CI on GitHub Actions.

---

## 4. Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS 4, lucide icons, custom dark glass UI |
| MSSQL bridge | Node.js, Express 5, `mssql` driver, helmet, express-rate-limit |
| Community hub | Node.js, Express 5, Prisma 5, PostgreSQL |
| Security | Web Crypto (AES-256-GCM) in browser, SELECT-only SQL gate, rate limiting, CORS allowlist |
| Testing | Vitest, Testing Library, Supertest, coverage via v8 |
| Deployment | Docker (self-host image), GitHub Actions CI, hosted hub at db-flow.remotatech.com |

### Architecture (one paragraph)

The React frontend talks to two small Express services. The **bridge** receives a SQL string plus a connection descriptor per request, opens a pooled MSSQL connection, runs one read-only statement and streams back rows. The **hub** stores published report definitions in Postgres via Prisma and serves browse/search/publish endpoints. In production both are mounted on one origin next to the static build; in development Vite proxies `/api/hub` to the hub and `/api` to the bridge.

```
Browser (React)  ──/api/query──▶  Bridge (Express + mssql)  ──▶  User's MSSQL / JTL-Wawi
       │
       └──────/api/hub───▶  Hub (Express + Prisma)  ──▶  PostgreSQL
```

---

## 5. Screenshots

All files live in `screenshots/`. Desktop shots are 2880×1800 (1440×900 @2x), mobile shots are 780×1688 (390×844 @2x). Dark theme only (the app is dark-only).

**Note:** the results table in `06-results-drawer.png` shows **sample data** injected for the screenshot; no real customer data is included. All other screens show real app state.

| # | File | Suggested caption (EN) | Alt text |
|---|---|---|---|
| 1 | `01-home-templates.png` | Start screen: pick one of six report templates or search. | DBFLOW home screen with a grid of six report template cards on a dark background |
| 2 | `02-home-blank-start.png` | Start blank: choose any JTL-Wawi table by category. | Table picker with category sidebar and a grid of JTL-Wawi tables like tArtikel and tAuftrag |
| 3 | `03-community-hub.png` | Community marketplace with featured, most downloaded and most executed reports. | Community hub page showing three ranked lists and a searchable grid of shared reports |
| 4 | `04-settings-connection.png` | Connection dialog: credentials are encrypted in the browser and stay on your machine. | Database connection modal with host, port, instance, user and password fields and security badges |
| 5 | `05-builder-pipeline.png` | The pipeline: Source → Join → Sort → Columns as readable step cards. | Report builder showing four stacked step cards connected by a vertical line |
| 6 | `06-results-drawer.png` | Generated SQL side by side with live results and CSV export. | Results drawer split into highlighted SQL on the left and a data table on the right |
| 7 | `07-variables-panel.png` | Named variables like @zeitraum can be reused in filters. | Floating variables panel next to the pipeline showing a DATEADD expression |
| 8 | `08-add-step-menu.png` | Insert a step anywhere; already-used single steps are marked. | Dropdown menu listing step types Verknüpfung, Filter, Gruppierung, Sortierung, Spalten, Formatierung |
| 9 | `09-publish-modal.png` | Publish a report to the community: structure only, never data or credentials. | Publish modal with title, description, tags, author, icon grid and colour swatches |
| 10 | `10-mobile-home.png` | Mobile start screen. | Phone-width view of the DBFLOW template gallery |
| 11 | `11-mobile-builder.png` | Mobile builder with the same step pipeline. | Phone-width view of the report builder with step cards |

**Recommended hero image:** `06-results-drawer.png` (shows pipeline, SQL and data at once). Fallback: `05-builder-pipeline.png`.

**Recommended order on the page:** 6, 5, 1, 3, 4, 9, 7, 8, 2, 10, 11.

---

## 6. Key numbers (for stat tiles, optional)

| Stat | Value |
|---|---|
| Step types | 7 |
| Built-in templates | 6 |
| Supported JTL-Wawi schema versions | 1.11.x – 2.x |
| Row cap per query (default) | 5 000 |
| Credential storage on server | none |

---

## 7. Tags / keywords

`JTL-Wawi` `MSSQL` `SQL` `No-Code` `Reporting` `Business Intelligence` `React` `Vite` `Express` `Prisma` `PostgreSQL` `Docker` `Open Source` `E-Commerce` `Security` `Self-Hosted`

---

## 8. Links to place on the page

- Live app: https://db-flow.remotatech.com
- GitHub: https://github.com/RemotaTech/JTL-DB-FLOW
- Docs: repository README, SECURITY.md, CONTRIBUTING.md
- Contact: info@remotatech.com

---

## 9. Notes for the agent building the page

- Screenshots are PNG at 2x. Convert to WebP/AVIF and serve at 1440px wide for the desktop shots; keep the PNGs as lightbox originals if wanted.
- The UI is German. Captions above are English; use the DE copy block if the portfolio page is German.
- Do not crop the settings modal (`04`) below the two badges; "AES-256 im Browser" and "Bleibt auf diesem Rechner" are the security story.
- Mark `06-results-drawer.png` as showing sample data if the page has an image caption field.
- Brand colour used in the app: `#3b82f6` (blue). Background: `#050505`.
