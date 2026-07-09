FROM ubuntu:22.04 AS base
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates curl git unzip xz-utils sudo wget ripgrep \
    python3 python3-pip python3-venv build-essential \
    libgtk-3-0 libnss3 libasound2 libxcb1 libdrm2 \
    libxcomposite1 libxcursor1 libxdamage1 libxext6 \
    libxi6 libxrender1 libxtst6 libpango-1.0-0 \
    libcairo2 libgdk-pixbuf-2.0-0 libfontconfig1 libxkbcommon0 \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash \
  && cp /root/.bun/bin/bun /usr/local/bin/bun \
  && cp /root/.bun/bin/bunx /usr/local/bin/bunx \
  && rm -rf /root/.bun

FROM base AS builder
WORKDIR /app

COPY package.json bun.lock ./
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

RUN mkdir -p /app/data /home/crewfactory \
  && addgroup --system crewfactory \
  && adduser --system --ingroup crewfactory --home /home/crewfactory --disabled-password --gecos "" crewfactory \
  && chown crewfactory:crewfactory /home/crewfactory \
  && echo "crewfactory ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers \
  && chown crewfactory:crewfactory /app /app/data

RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
EXPOSE 3001

ENV PORT=3000
ENV ENGRAM_SQLITE_DRIVER=bun
ENV CREWFACTORY_DATA_PATH=/app/data
ENV PLAYWRIGHT_BROWSERS_PATH=/app/data/ms-playwright
ENV PIP_CACHE_DIR=/app/data/.cache/pip
ENV CARGO_HOME=/app/data/.cargo
ENV HOME=/home/crewfactory

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

USER crewfactory
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bun", "run", "dist/index.js"]
