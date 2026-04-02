# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — build the Vite frontend
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --prefer-offline

COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the Vite frontend.
# VITE_BRIDGE_URL is '' by default — bridge routes are served on the same
# origin as the hub (hub-server.js mounts them in production).
# Override with --build-arg VITE_BRIDGE_URL=https://your-bridge.example.com
# only if you run the bridge on a separate host.
ARG VITE_BRIDGE_URL=
ENV VITE_BRIDGE_URL=${VITE_BRIDGE_URL}
RUN npm run build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — production runtime  (hub + bridge + static frontend, single port)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

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

# Run DB migrations then start the combined server (hub + bridge + static)
CMD ["sh", "-c", "npx prisma migrate deploy --schema ./prisma/schema.prisma && node hub-server.js"]
