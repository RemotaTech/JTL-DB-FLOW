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
RUN npm ci --prefer-offline

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

# Production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev --prefer-offline

# Prisma: schema + generated client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma

# Application source
COPY hub-server.js ./
COPY hub ./hub
COPY bridge ./bridge
COPY server.js ./

# Vite build output (served as static files)
COPY --from=builder /app/dist ./dist

# JTL schema / versions files used by bridge routes
COPY schema.json ./
COPY versions ./versions

EXPOSE 3002

# Run DB migrations (log failure but don't abort — server can still start)
# then start the combined hub + bridge + static frontend server.
CMD ["sh", "-c", "npx prisma migrate deploy --schema ./prisma/schema.prisma || echo '⚠️  Migration warning (see above) — starting server anyway'; node hub-server.js"]
