FROM oven/bun:1-slim AS base
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends adduser bash ca-certificates git ripgrep wget \
  && rm -rf /var/lib/apt/lists/* \
  && addgroup --system crewfactory \
  && adduser --system --ingroup crewfactory --no-create-home crewfactory

FROM base AS builder
WORKDIR /app

COPY package.json bun.lock* ./
COPY apps/client/package.json ./apps/client/
COPY apps/server/package.json ./apps/server/
COPY apps/landing/package.json ./apps/landing/
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
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
EXPOSE 3001

ENV PORT=3000
ENV ENGRAM_SQLITE_DRIVER=bun
ENV CREWFACTORY_DATA_PATH=/app/data

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

USER crewfactory
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bun", "run", "dist/index.js"]
