## ---------- Backend Dockerfile (Express + TS) ----------
## Multi-stage build: build TypeScript (esbuild) and ship minimal runtime

ARG NODE_VERSION=20

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV NODE_ENV=production
WORKDIR /app

# 1) Install all deps (including dev) for build
FROM base AS deps
WORKDIR /app
COPY package*.json ./
# Need devDependencies for build (vite, esbuild, tsx)
RUN npm ci --include=dev

# 2) Build server (bundled) – also runs vite build if configured
FROM deps AS builder
WORKDIR /app
COPY . .
RUN npm run build \
 && npx esbuild scripts/migrate.ts --platform=node --packages=external --bundle --format=esm --outfile=dist/scripts/migrate.js

# 3) Runtime: only production deps + built output
FROM node:${NODE_VERSION}-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Copy only built artifacts; esbuild bundles server to dist/
COPY --from=builder /app/dist ./dist

# Optional: if your runtime needs static assets from vite build, copy them
# COPY --from=builder /app/dist/client ./public

EXPOSE 5000

# Ensure the server binds to all interfaces in container
ENV HOST=0.0.0.0 \
    PORT=5000

# Lightweight healthcheck without curl
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Required environment: DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID
CMD ["node", "dist/index.js"]
