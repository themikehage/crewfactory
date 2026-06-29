FROM oven/bun:1-slim AS base
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates git ripgrep \
  && rm -rf /var/lib/apt/lists/*

FROM base AS builder
WORKDIR /app

COPY package.json bun.lock* ./
COPY apps/client/package.json ./apps/client/
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/
RUN bun install --frozen-lockfile

COPY packages/shared ./packages/shared

COPY apps/server ./apps/server
RUN cd apps/server && bun build src/index.ts --outdir ./dist --target bun

COPY apps/client ./apps/client
RUN cd apps/client && bun run build

FROM base AS runner
WORKDIR /app

COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/client/dist ./public
COPY --from=builder /app/node_modules ./node_modules

RUN mkdir -p /tmp/crewfactory

EXPOSE 3000

ENV PORT=3000

CMD ["bun", "run", "dist/index.js"]
