# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — build the Vite frontend
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Prisma generate needs OpenSSL even at build time
RUN apk add --no-cache openssl

# Force development so npm ci installs ALL deps (including vite, @vitejs/plugin-react, etc.)
# Coolify injects NODE_ENV=production at build time which would skip devDependencies otherwise.
ENV NODE_ENV=development

COPY package*.json ./
# Use `npm install` (not `npm ci`) so npm resolves platform-specific optional
# binaries for the current OS/libc at build time.
# Vite 8 uses Rolldown (native Rust binary) — the lock file generated on macOS
# only contains darwin binaries; `npm ci` would therefore miss
# @rolldown/binding-linux-x64-musl on Alpine (musl libc).
RUN npm install --prefer-offline

COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the Vite frontend.
# VITE_BRIDGE_URL is '' by default — bridge routes are on the same origin.
ARG VITE_BRIDGE_URL=
ENV VITE_BRIDGE_URL=${VITE_BRIDGE_URL}
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — production runtime  (hub + bridge + static frontend, single port)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Prisma's query/schema engine binaries require OpenSSL.
# Alpine doesn't include it by default — install it explicitly.
RUN apk add --no-cache openssl

# Production dependencies only.
# Copy package-lock.json *from the builder stage* (instead of the build context)
# so BuildKit treats this runner stage as dependent on `builder` and runs the
# two stages sequentially rather than in parallel. Running both npm installs +
# the Vite/Rolldown native build concurrently spikes peak RAM and OOM-kills the
# build on small hosts; serialising them halves the peak memory.
COPY package.json ./
COPY --from=builder /app/package-lock.json ./package-lock.json
RUN npm ci --omit=dev --prefer-offline

# Prisma: schema + generated client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma

# Application source
COPY hub-server.js ./
COPY hub ./hub
COPY bridge ./bridge
COPY server.js ./

# Shared lib modules imported at runtime by the hub (e.g. hub/seed.js pulls in
# src/lib/reportTemplates.js -> steps.js -> columns.js). These live under src/
# but are plain ESM with no frontend deps, so they must ship to the runner too.
COPY src/lib ./src/lib

# Vite build output (served as static files)
COPY --from=builder /app/dist ./dist

# JTL schema / versions files used by bridge routes
COPY schema.json ./
COPY versions ./versions

EXPOSE 3002

# Sync the DB schema (idempotent — works with or without migration files,
# safe to run against an already-populated database) then start the server.
CMD ["sh", "-c", "npx prisma db push --schema ./prisma/schema.prisma --skip-generate && node hub-server.js"]
