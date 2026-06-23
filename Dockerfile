# ── Stage 1: Build frontend SPA ──
FROM node:22-alpine AS frontend-build
WORKDIR /client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build
# Output: /client/build/

# ── Stage 2: Production backend + serve static ──
FROM node:22-alpine
WORKDIR /app

# better-sqlite3 needs native build tools
RUN apk add --no-cache python3 make g++

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server/tsconfig.json ./
COPY server/src/ ./src/

# Copy frontend build → served by Hono static middleware
COPY --from=frontend-build /client/build/ ./public/

RUN mkdir -p /app/data
EXPOSE 3000

CMD npx tsx src/db/migrate.ts && npx tsx src/index.ts
