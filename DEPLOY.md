# Deploy Guide

## Requirements

- Docker + Docker Compose v2+
- 3 mandatory environment variables (see below)
- At least one LLM API key to run agents

## Environment Variables

### Mandatory

| Variable | Description | How to generate |
|----------|-------------|-----------------|
| `JWT_SECRET` | JWT signing secret | `openssl rand -base64 32` |
| `AUTH_USERNAME` | Login username | Any string (e.g. `admin`) |
| `AUTH_PASSWORD_HASH` | Base64-encoded bcrypt hash | See command below |

**Generate password hash:**
```bash
bun -e "import bcrypt from 'bcryptjs'; const h = await bcrypt.hash('yourpassword', 10); console.log(Buffer.from(h).toString('base64'));"
```

> **Why base64?** Docker and Coolify expand `$` characters in bcrypt hashes, corrupting them. The server decodes from base64 at runtime.

### Optional (at least one required to run agents)

| Variable | Provider |
|----------|----------|
| `ANTHROPIC_API_KEY` | Anthropic (Claude) |
| `OPENAI_API_KEY` | OpenAI (GPT) |
| `DASHSCOPE_API_KEY` | Alibaba DashScope (Qwen) |

---

## Option 1: Coolify (recommended)

1. New project → **Deploy from Git**
2. Repository URL: `https://github.com/themikehage/crewfactory`
3. Build pack: **Docker Compose**
4. Set the 3 mandatory env vars in the Environment tab
5. **Deploy**

Health check is automatic — Coolify reads the `healthcheck` from `docker-compose.yml`.

---

## Option 2: Dokploy

1. Applications → **New Application** → Docker Compose
2. Paste the contents of `docker-compose.yml`
3. Set env vars
4. Deploy

---

## Option 3: Docker Compose (manual)

```bash
git clone https://github.com/themikehage/crewfactory.git
cd crewfactory
cp .env.example .env
# Edit .env and fill in the mandatory variables
nano .env
docker compose up -d
```

App available at `http://localhost:3000`.

---

## Option 4: Docker run (single command)

```bash
docker run -d \
  --name crewfactory \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 3001:3001 \
  -v crewfactory-data:/app/data \
  -e JWT_SECRET="your-secret" \
  -e AUTH_USERNAME="admin" \
  -e AUTH_PASSWORD_HASH="your-base64-hash" \
  -e ANTHROPIC_API_KEY="sk-ant-..." \
  ghcr.io/themikehage/crewfactory:latest
```

---

## Option 5: Local development

```bash
git clone https://github.com/themikehage/crewfactory.git
cd crewfactory
cp .env.example .env
# Fill in env vars
bun install
bun run dev
```

---

## Updating

```bash
# Docker Compose
docker compose pull && docker compose up -d

# Docker run
docker pull ghcr.io/themikehage/crewfactory:latest
docker stop crewfactory && docker rm crewfactory
# Re-run the docker run command above
```

---

## Health Check

```
GET http://localhost:3000/api/health
```

Returns `200 OK` when the server is ready. Used by Docker, Coolify, and Dokploy to determine service health.
