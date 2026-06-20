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

RUN mkdir -p /tmp/pi-web-users

EXPOSE 3000

ENV PORT=3000

ARG JWT_SECRET
ARG AUTH_USERNAME
ARG AUTH_PASSWORD_HASH
ARG ANTHROPIC_API_KEY
ARG OPENAI_API_KEY
ARG GEMINI_API_KEY
ARG DEEPSEEK_API_KEY
ARG GROQ_API_KEY
ARG MISTRAL_API_KEY
ARG OPENROUTER_API_KEY

ENV JWT_SECRET=$JWT_SECRET
ENV AUTH_USERNAME=$AUTH_USERNAME
ENV AUTH_PASSWORD_HASH=$AUTH_PASSWORD_HASH
ENV ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
ENV OPENAI_API_KEY=$OPENAI_API_KEY
ENV GEMINI_API_KEY=$GEMINI_API_KEY
ENV DEEPSEEK_API_KEY=$DEEPSEEK_API_KEY
ENV GROQ_API_KEY=$GROQ_API_KEY
ENV MISTRAL_API_KEY=$MISTRAL_API_KEY
ENV OPENROUTER_API_KEY=$OPENROUTER_API_KEY

CMD ["bun", "run", "dist/index.js"]
