# syntax=docker/dockerfile:1

# ---- Base ------------------------------------------------------------
FROM node:20-bookworm-slim AS base
WORKDIR /app
# openssl é necessário em runtime pelo engine do Prisma
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# ---- Dependencies (com devDependencies, para build e prisma generate) --
FROM base AS deps
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm install

# ---- Build -------------------------------------------------------------
FROM deps AS build
COPY . .
RUN npm run build

# ---- Dependencies de produção somente -----------------------------------
FROM base AS prod-deps
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm install --omit=dev

# ---- Runtime -------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/prisma ./prisma
COPY --from=build /app/dist ./dist
COPY package.json ./

EXPOSE 3333

# Aplica migrations pendentes antes de subir a API (exige DATABASE_URL e DIRECT_URL).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/server.js"]
