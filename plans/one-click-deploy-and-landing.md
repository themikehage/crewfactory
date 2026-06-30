# One-Click Deployment & Landing Page

Hacer de CrewFactory un proyecto open-source desplegable en un clic por cualquier desarrollador, con calidad de producción y una landing page profesional para SEO.

---

## 1. Motivación

CrewFactory es un proyecto open-source. Para que la comunidad lo adopte, el deploy debe ser trivial —no pueden requerirse horas de configuración. Hoy funciona en Coolify (producción actual), pero el `docker-compose.yml` y `Dockerfile` tienen carencias de producción y no hay templates oficiales para ninguna plataforma.

---

## 2. Diagnóstico del Estado Actual

### Dockerfile

| Aspecto | Estado |
|---------|--------|
| Multi-stage | ✅ Correcto (3 etapas: base, builder, runner) |
| `HEALTHCHECK` | ❌ Ausente |
| Non-root user | ❌ Corre como root |
| Dependencias runtime | ✅ `ca-certificates`, `git`, `ripgrep` |
| Exposición de puertos | ✅ `EXPOSE 3000 3001` |

### docker-compose.yml

| Aspecto | Estado |
|---------|--------|
| Volumen persistente | ✅ Named volume (`crewfactory-data`) |
| `restart` policy | ❌ Ausente |
| `healthcheck` | ❌ Ausente |
| Resource limits | ❌ Ausente |
| Env vars requeridas | ⚠️ Hardcodeadas (`change-me-in-production`, `admin`, hash por defecto) |
| Puerto preview (3001) | ❌ No expuesto |
| `init: true` | ❌ Ausente |

### Documentación

| Aspecto | Estado |
|---------|--------|
| `.env.example` | ❌ No existe |
| Referencia de env vars | ⚠️ Dispersa en AGENTS.md y código |
| Guía de deploy | ❌ No hay |
| One-click template | ❌ No existe para Coolify ni Dokploy |

---

## 3. Componentes del Plan

### 3.1 Producción-Grade docker-compose.yml

Archivo principal de despliegue con todas las prácticas de producción:

```yaml
# docker-compose.yml (producción)
services:
  crewfactory:
    build:
      context: .
      dockerfile: Dockerfile
    restart: unless-stopped
    init: true
    ports:
      - "3000:3000"
      - "3001:3001"
    environment:
      - JWT_SECRET=${JWT_SECRET:?Must set JWT_SECRET}
      - AUTH_USERNAME=${AUTH_USERNAME:?Must set AUTH_USERNAME}
      - AUTH_PASSWORD_HASH=${AUTH_PASSWORD_HASH:?Must set AUTH_PASSWORD_HASH}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
      - OPENAI_API_KEY=${OPENAI_API_KEY:-}
      - GOOGLE_API_KEY=${GOOGLE_API_KEY:-}
      - DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY:-}
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 3s
      start_period: 10s
      retries: 3
    volumes:
      - crewfactory-data:/tmp/crewfactory
    deploy:
      resources:
        limits:
          memory: 2G
        reservations:
          memory: 512M

volumes:
  crewfactory-data:
```

### 3.2 Dockerfile Mejorado

```dockerfile
# healthcheck + non-root user + optimizaciones
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

RUN addgroup -S crewfactory && adduser -S crewfactory -G crewfactory
USER crewfactory
```

### 3.3 `.env.example`

Archivo en la raíz del repo documentando todas las variables de entorno:

```bash
# --- Obligatorias ---
JWT_SECRET=                        # Clave para firmar JWT (generar con: openssl rand -base64 32)
AUTH_USERNAME=admin                # Usuario de login
AUTH_PASSWORD_HASH=               # Hash bcrypt en base64 (ver instrucciones abajo)

# --- Opcionales (al menos una requerida para usar la app) ---
ANTHROPIC_API_KEY=                 # Clave API de Anthropic (Claude)
OPENAI_API_KEY=                    # Clave API de OpenAI (GPT)
GOOGLE_API_KEY=                    # Clave API de Google (Gemini)
DEEPSEEK_API_KEY=                  # Clave API de DeepSeek

# --- Opcionales (infraestructura) ---
PORT=3000                          # Puerto del servidor principal
```

### 3.4 One-Click Coolify Template

Archivo `coolify-template.json` con la metadata para importar en Coolify:

- Service name, logo, descripción
- Variables de entorno documentadas con defaults
- Puerto expuesto y health check
- Volumen persistente

Además, instrucciones en la documentación para:
- "Deploy from Git" apuntando al repo
- Pegar la URL del repositorio
- Configurar las 3 variables obligatorias
- ¡Listo!

### 3.5 One-Click Dokploy Blueprint

Estructura `blueprints/crewfactory/`:

```
blueprints/crewfactory/
├── docker-compose.yml       # Idéntico al principal o una variante
├── template.toml            # Metadata para el catálogo de Dokploy
│   [config]
│   name = "CrewFactory"
│   description = "..."
│   
│   [[config.domains]]
│   serviceName = "crewfactory"
│   
│   [[config.mounts]]
│   filePath = "/tmp/crewfactory"
│
├── logo.svg                 # Logo de la app
└── meta.json                # Metadata adicional
```

### 3.6 Landing Page (`apps/landing/` o independiente)

Página web profesional para SEO y descripción del producto:

**Stack sugerido:** React + Vite + Tailwind (mismo stack, reutiliza componentes UI compartidos si se desea)

**Secciones:**
1. **Hero**: "CrewFactory — Multi-Agent Development Platform"
   - Subtítulo: "Create, orchestrate, and optimize AI agents in your browser"
   - CTA: "Deploy in one click" + "View on GitHub"

2. **Features**: Grid con las capacidades clave
   - Multi-agent chat con streaming
   - Programmatic agents
   - Channel collaboration
   - Live preview de builds
   - File workspace
   - Task runner / supervisor

3. **How it works**: 3-step visual
   - Configure providers → Create agents → Delegate tasks

4. **Deployment**: Badges de Coolify + Dokploy one-click
   - "Deploy to Coolify" button
   - "Deploy to Dokploy" button
   - Docker pull command

5. **Open Source**: Link a GitHub, stars, license MIT

**SEO:**
- Meta tags OG (title, description, image)
- Schema.org `SoftwareApplication` structured data
- Sitemap.xml + robots.txt
- Semantic HTML headings

### 3.7 Guía de Deploy para Desarrolladores

`DEPLOY.md` en la raíz del repo:

```markdown
# Deploy

## Requisitos
- Docker y Docker Compose
- 3 variables de entorno obligatorias

## Opción 1: Coolify (recomendado)
1. Nuevo proyecto → "Deploy from Git"
2. URL: https://github.com/themikehage/crewfactory
3. Build pack: Docker Compose
4. Configurar env vars
5. Deploy

## Opción 2: Dokploy
1. ... (mismo flujo)

## Opción 3: Docker Compose manual
$ cp .env.example .env
$ nano .env   # llenar variables
$ docker compose up -d

## Opción 4: Docker run
$ docker run -d \
  -p 3000:3000 -p 3001:3001 \
  -v crewfactory-data:/tmp/crewfactory \
  -e JWT_SECRET=... \
  -e AUTH_USERNAME=... \
  -e AUTH_PASSWORD_HASH=... \
  ghcr.io/themikehage/crewfactory:latest
```

### 3.8 GitHub Container Registry (GHCR)

Pipeline CI para publicar imágenes automáticamente:

```yaml
# .github/workflows/docker-publish.yml
on:
  push:
    branches: [main]
    tags: ['v*']

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - run: docker build -t ghcr.io/themikehage/crewfactory:latest .
      - run: docker push ghcr.io/themikehage/crewfactory:latest
```

---

## 4. Estructura de Archivos Propuesta

```
crewfactory/
├── Dockerfile                    # Mejorado (HEALTHCHECK + non-root)
├── docker-compose.yml            # Producción-grade
├── .env.example                  # Documentación de env vars
├── DEPLOY.md                     # Guía de deploy multi-opción
├── coolify-template.json         # One-click Coolify
├── blueprints/
│   └── crewfactory/
│       ├── docker-compose.yml
│       ├── template.toml
│       ├── logo.svg
│       └── meta.json
├── apps/
│   └── landing/                  # Landing page (opcional)
│       ├── src/
│       │   ├── pages/
│       │   │   └── index.tsx
│       │   ├── components/
│       │   └── index.css
│       ├── public/
│       ├── package.json
│       └── vite.config.ts
├── .github/
│   └── workflows/
│       └── docker-publish.yml    # CI a GHCR
└── public/
    └── og-image.png              # Open Graph image for landing
```

---

## 5. Orden de Implementación

1. **Fase 1 — Producción** (Dockerfile + compose + .env.example)
   - HEALTHCHECK en Dockerfile
   - Non-root user
   - docker-compose.yml con restart, healthcheck, init, resource limits, env vars obligatorias
   - `.env.example`
   - `DEPLOY.md`

2. **Fase 2 — One-Click Templates**
   - Coolify template (json metadata)
   - Dokploy blueprint (template.toml + logo + meta.json)
   - Publicar en tiendas/guías

3. **Fase 3 — Landing Page**
   - Scaffold `apps/landing/` con Vite + React + Tailwind
   - Hero, Features, How it works, Deployment, Open Source
   - SEO: meta tags, OG, schema.org, sitemap
   - Publicar en Coolify o Cloudflare Pages

4. **Fase 4 — CI/CD**
   - Workflow de GitHub Actions para build + push a GHCR
   - Build automático de landing page
   - Badges en README

---

## 6. Métricas de Éxito

- Un desarrollador nuevo puede tener CrewFactory corriendo en <5 minutos
- Los templates pasan validación de Coolify y Dokploy
- Landing page indexada en Google con posición top 10 para "crewfactory multi-agent platform"
- Imagen Docker publicada en GHCR con tags semver
- Sin issues de seguridad reportados (non-root, health checks, env vars forzadas)
