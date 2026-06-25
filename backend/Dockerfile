# 🐳 PRODUCTION DOCKERFILE (Scale-Optimized for 1000+ Tenants)
# Node.js 22 LTS — paridad con el runtime de Render (22.22.0)
FROM node:22-alpine AS base

# Install dependencies for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Generate Prisma Client
RUN npx prisma generate

# Copy application code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:22-alpine AS production

# Install only runtime dependencies
RUN apk add --no-cache \
    cairo \
    jpeg \
    pango \
    giflib \
    pixman \
    dumb-init

WORKDIR /app

# Copy built application
COPY --from=base /app/dist ./dist
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/package*.json ./
COPY --from=base /app/ecosystem.config.json ./ecosystem.config.json

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app && \
    mkdir -p /app/logs && \
    chown -R nodejs:nodejs /app/logs

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 🔥 CRITICAL: Memory flags for Node.js (optimized for 4GB / 1000 tenants)
# Heap: 3072MB (leaves ~1GB for OS, Redis, Postgres sidecar)
# Semi-space: 64MB (reduced for lower GC pause, sufficient for CRM workload)
ENV NODE_OPTIONS="--max-old-space-size=3072 --max-semi-space-size=64 --expose-gc"

# [SEC] SCALE FIX: Increase file descriptor limit for high connection count.
# Each WhatsApp session + socket.io client + Redis connection uses a FD.
# Default is 1024 which is exhausted at ~300 concurrent connections.
# NOTE: This requires the container to run with --ulimit nofile=65535:65535
# or have the host/orchestrator configured accordingly.
# For Docker Compose, add: ulimits: { nofile: { soft: 65535, hard: 65535 } }

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "dist/server.js"]
