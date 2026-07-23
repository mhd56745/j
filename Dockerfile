# ================================================================
# IPTV Restreaming Server - Dockerfile
# Optimized for Low VPS / Koyeb Deployment
# ================================================================
FROM node:18-alpine AS base

# Install build deps for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --production && npm cache clean --force

# Copy source
COPY . .

# Seed database on first run
RUN node scripts/init-db.js

# Create data directory
RUN mkdir -p /app/data

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Start
CMD ["node", "server.js"]