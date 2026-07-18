# 🐳 STAGE 1: Build TypeScript source and generate Prisma Client
FROM node:22-slim AS builder

WORKDIR /app

# Install build dependencies and openssl for Prisma client generation
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

RUN npm ci
RUN npm run prisma:generate

COPY src ./src
RUN npm run build

# 🐳 STAGE 2: Light weight runner container
FROM node:22-slim AS runner

WORKDIR /app

# Install runtime openssl for Prisma Client execution
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma/

# Install only production dependencies
RUN npm ci --only=production

# Copy compiled source and generated Prisma Client
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/dist ./dist

# Create persistent storage folder for Anti-Ban warmup states with node ownership
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 10000

VOLUME [ "/app/data" ]

CMD ["npm", "run", "start"]
