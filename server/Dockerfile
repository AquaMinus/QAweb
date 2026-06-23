# ── Build stage ──
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Production stage ──
FROM node:22-alpine
WORKDIR /app

# Runtime deps (better-sqlite3 needs build tools)
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY tsconfig.json ./
COPY src/ ./src/

# Create data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 3000

# Run migration then start
CMD npx tsx src/db/migrate.ts && npx tsx src/index.ts
