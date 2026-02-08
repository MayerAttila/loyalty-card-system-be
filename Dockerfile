FROM node:20.19.0-bookworm-slim AS deps

WORKDIR /app

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder

# Prisma needs DATABASE_URL at build time but doesn't connect.
# Use a safe default so Docker builds don't require build args.
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/loyalty_saas?schema=public

COPY prisma ./prisma
COPY tsconfig.json prisma.config.ts ./
COPY src ./src

RUN npm run prisma:generate
RUN npm run build

FROM node:20.19.0-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/dist ./dist


CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/server.js"]
