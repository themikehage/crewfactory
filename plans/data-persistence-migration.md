# Plan: Migracion a Persistencia Robusta con Docker Compose

## Problema

Actualmente todos los datos de sesiones, workspaces, claves y configuracion se almacenan en `/tmp/crewfactory/`. Este path:
- Esta hardcodeado ~100 veces en el codigo del servidor
- No es configurable via variable de entorno
- Usa `/tmp/` semanticamente incorrecto (datos persistentes, no temporales)
- El Dockerfile crea el directorio en build-time, pero un volumen Docker lo oculta al montarse
- No hay inicializacion en startup que garantice la existencia de subdirectorios

## Objetivo

Migrar a un modelo donde:
- Los paths de datos sean configurables via variables de entorno
- El punto de montaje unico sea `/app/data` (no `/tmp`)
- Docker Compose sea el metodo de despliegue primario
- Un entrypoint script asegure la creacion de directorios en cada inicio
- El esquema de datos evolucione via migraciones (como SQLite schema)

---

## Paso 1: Centralizar el path base en una constante configurable

### Archivos a crear

**`packages/shared/src/paths.ts`** -- Constantes de path centralizadas:

```typescript
import { env } from "node:process";

export const DEFAULTS = {
  BASE_PATH: "/app/data",
  AUDIT_DIR: "_audit",
  USERS_DIR: "users",
  WORKSPACE_DIR: "workspace",
  PROJECTS_DIR: "projects",
  AGENTS_DIR: "agents",
  CHANNELS_DIR: "channels",
  SESSIONS_DIR: "sessions",
  EXPERIMENTS_DIR: "experiments",
  BENCHMARKS_DIR: "benchmarks",
  MEMORIES_DIR: "memories",
  ASSETS_DIR: "assets",
  UPLOADS_DIR: "uploads",
  GENERATED_DIR: "generated",
  SKILLS_DIR: ".agents/skills",
} as const;

export function getBasePath(): string {
  return process.env.CREWFACTORY_DATA_PATH || DEFAULTS.BASE_PATH;
}

export function getUserDir(username: string): string {
  return join(getBasePath(), DEFAULTS.USERS_DIR, username);
}

export function getAuditDir(): string {
  return join(getBasePath(), DEFAULTS.AUDIT_DIR);
}

export function getWorkspaceDir(username: string): string {
  return join(getUserDir(username), DEFAULTS.WORKSPACE_DIR);
}

export function getProjectsDir(username: string): string {
  return join(getUserDir(username), DEFAULTS.PROJECTS_DIR);
}

export function getProjectDir(username: string, projectId: string): string {
  return join(getProjectsDir(username), projectId);
}

export function getAgentsDir(username: string): string {
  return join(getUserDir(username), DEFAULTS.AGENTS_DIR);
}

export function getAgentDir(username: string, agentId: string): string {
  return join(getAgentsDir(username), agentId);
}

export function getChannelsDir(username: string): string {
  return join(getUserDir(username), DEFAULTS.CHANNELS_DIR);
}

export function getChannelDir(username: string, channelId: string): string {
  return join(getChannelsDir(username), channelId);
}

export function getSessionsDir(username: string): string {
  return join(getUserDir(username), DEFAULTS.SESSIONS_DIR);
}

export function getSessionDir(username: string, sessionId: string): string {
  return join(getSessionsDir(username), sessionId);
}

export function getExperimentsDir(username: string): string {
  return join(getUserDir(username), DEFAULTS.EXPERIMENTS_DIR);
}

export function getBenchmarksDir(username: string): string {
  return join(getUserDir(username), DEFAULTS.BENCHMARKS_DIR);
}

export function getEnvPath(username: string): string {
  return join(getUserDir(username), "env.json");
}

export function getAuthPath(username: string): string {
  return join(getUserDir(username), "auth.json");
}

export async function ensureDataDirectories(username: string): Promise<void> {
  const dirs = [
    getBasePath(),
    getAuditDir(),
    getUserDir(username),
    getWorkspaceDir(username),
    getProjectsDir(username),
    getAgentsDir(username),
    getChannelsDir(username),
    getSessionsDir(username),
    getExperimentsDir(username),
    getBenchmarksDir(username),
    join(getWorkspaceDir(username), DEFAULTS.SKILLS_DIR),
    join(getWorkspaceDir(username), DEFAULTS.ASSETS_DIR, DEFAULTS.UPLOADS_DIR),
    join(getWorkspaceDir(username), DEFAULTS.ASSETS_DIR, DEFAULTS.GENERATED_DIR),
    join(getWorkspaceDir(username), DEFAULTS.MEMORIES_DIR, DEFAULTS.PROJECTS_DIR),
    join(getWorkspaceDir(username), DEFAULTS.MEMORIES_DIR, DEFAULTS.SESSIONS_DIR),
  ];
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}
```

### Migracion del codigo existente

Reemplazar las ~100 ocurrencias de `/tmp/crewfactory` por las funciones de `paths.ts`.

**Estrategia de migracion (por modulo):**

| Modulo | Reemplazar | Por |
|--------|-----------|-----|
| `session-manager.ts` | `` `/tmp/crewfactory/${username}` `` | `getUserDir(username)` |
| `session-manager.ts` | `ensureUserDir()` | `getUserDir()` + `ensureDataDirectories()` |
| `routes/files.ts` | `` `/tmp/crewfactory/${username}/workspace` `` | `getWorkspaceDir(username)` |
| `routes/files.ts` | `` `/tmp/crewfactory/${username}/projects` `` | `getProjectsDir(username)` |
| `ws/handler.ts` | `` `/tmp/crewfactory/${username}/sessions/...` `` | `getSessionDir(username, sessionId)` |
| `mcp-registry.ts` | `` `/tmp/crewfactory/${username}` `` | `getUserDir(username)` |
| `audit-log.ts` | `/tmp/crewfactory/_audit` | `getAuditDir()` |
| ... | todos los demas | funcion correspondiente |

Se puede automatizar con un script de busqueda/reemplazo:

```bash
# Lista de todos los archivos con el path hardcodeado
rg -l "/tmp/crewfactory" apps/server/src/ --include="*.ts"
```

---

## Paso 2: Entrypoint de contenedor

### **`scripts/docker-entrypoint.sh`**

Script que se ejecuta en cada inicio del contenedor para garantizar que los directorios necesarios existen y los permisos son correctos.

```bash
#!/bin/sh
set -e

DATA_PATH="${CREWFACTORY_DATA_PATH:-/app/data}"

# Crear directorios raiz de datos si no existen
mkdir -p "$DATA_PATH"

# Si se ejecuta como root, cambiar ownership al usuario no-root
if [ "$(id -u)" = "0" ]; then
  chown -R crewfactory:crewfactory "$DATA_PATH"
fi

# Ejecutar el comando principal
exec "$@"
```

---

## Paso 3: Actualizar Dockerfile

```dockerfile
FROM oven/bun:1-slim AS base
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends adduser bash ca-certificates git ripgrep wget \
  && rm -rf /var/lib/apt/lists/* \
  && addgroup --system crewfactory \
  && adduser --system --ingroup crewfactory --no-create-home crewfactory

# --- (builder stage sin cambios) ---

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
ENV CREWFACTORY_DATA_PATH=/app/data

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

USER crewfactory
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["bun", "run", "dist/index.js"]
```

**Cambios clave:**
- `ENTRYPOINT` en vez de `CMD` directo
- No se hace `mkdir -p /tmp/crewfactory` en build-time (se hace en entrypoint)
- Variable de entorno `CREWFACTORY_DATA_PATH` con default `/app/data`
- Entrypoint script copiado e incluido en la imagen

---

## Paso 4: Actualizar docker-compose.yml

```yaml
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
      - CREWFACTORY_DATA_PATH=/app/data
      - JWT_SECRET=${JWT_SECRET:?Must set JWT_SECRET (openssl rand -base64 32)}
      - AUTH_USERNAME=${AUTH_USERNAME:?Must set AUTH_USERNAME}
      - AUTH_PASSWORD_HASH=${AUTH_PASSWORD_HASH:?Must set AUTH_PASSWORD_HASH}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
      - OPENAI_API_KEY=${OPENAI_API_KEY:-}
      - DASHSCOPE_API_KEY=${DASHSCOPE_API_KEY:-}
      - EXA_API_KEY=${EXA_API_KEY:-}
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 3s
      start_period: 10s
      retries: 3
    volumes:
      - crewfactory-data:/app/data
    deploy:
      resources:
        limits:
          memory: 2G
        reservations:
          memory: 512M

volumes:
  crewfactory-data:
    driver: local
```

**Cambios clave:**
- Volumen montado en `/app/data` (no `/tmp/crewfactory`)
- Variable `CREWFACTORY_DATA_PATH` seteada explicitamente (documentacion)
- `.env.example` agregado como referencia para las vars requeridas

---

## Paso 5: Migracion de datos existentes

### **`scripts/migrate-paths.ts`**

Script de una sola ejecucion que migra datos de `{oldBase}/{username}/*` a `{newBase}/users/{username}/*`:

```typescript
// 1. Lee el path antiguo (/tmp/crewfactory/{username}/)
// 2. Lee el path nuevo (/app/data/users/{username}/)
// 3. Si el nuevo no existe y el antiguo si, copia los datos (cp -r)
// 4. Actualiza metadata.json y archivos de configuracion si referencian paths absolutos
```

Se ejecuta automaticamente en el primer inicio del contenedor:

```bash
bun run scripts/migrate-paths.ts
```

Opcion: en el entrypoint, detectar si existe el path legacy y migrar automaticamente antes de arrancar el servidor.

---

## Paso 6: .dockerignore

```gitignore
.git/
.gitignore
node_modules/
data/
workspace/
dist/
.next/
.env
*.md
plans/
docs/
scripts/
blueprints/
community/
examples/
cli_gap_analysis.md
next-steps.md
```

Anadir `data/` y `workspace/` para evitar que datos locales se incluyan en el build.

---

## Paso 7: Actualizar Coolify

### Opcion A: Docker Compose (recomendada)

Configurar Coolify para usar `docker-compose.yml` en vez de `Dockerfile`:

1. En la UI de Coolify, cambiar el "Build Pack" de `dockerfile` a `docker-compose`
2. El volumen `crewhub-data` se crea automaticamente por el compose
3. Agregar variables de entorno requeridas en la UI de Coolify

### Opcion B: Standalone Docker con variables de entorno

Si se prefiere mantener standalone Docker:

1. Agregar variable de entorno en Coolify: `CREWFACTORY_DATA_PATH=/app/data`
2. Agregar volumen persistente en Coolify: `/app/data`
3. Actualizar health check si es necesario

---

## Resumen de Archivos a Modificar/Crear

| Archivo | Accion |
|---------|--------|
| `packages/shared/src/paths.ts` | CREAR |
| `packages/shared/src/index.ts` | MODIFICAR (exportar paths) |
| `scripts/docker-entrypoint.sh` | CREAR |
| `scripts/migrate-paths.ts` | CREAR |
| `Dockerfile` | MODIFICAR (entrypoint, env vars) |
| `docker-compose.yml` | MODIFICAR (volumen en /app/data) |
| `.dockerignore` | MODIFICAR (excluir data/) |
| `.env.example` | CREAR |
| `coolify-template.json` | MODIFICAR (path a /app/data) |
| `blueprints/crewfactory/template.toml` | MODIFICAR (path a /app/data) |
| `blueprints/crewfactory/meta.json` | MODIFICAR (path a /app/data) |
| ~22 archivos .ts en apps/server/ | MODIFICAR (paths hardcodeados -> funciones paths.ts) |

---

## Migracion Automatica de Paths (script bash helper)

```bash
# Identificar todos los archivos con el path hardcodeado
rg -l "/tmp/crewfactory" apps/server/src/ --include="*.ts"

# Por cada archivo, el reemplazo especifico depende del contexto:
# - `/tmp/crewfactory/${username}` -> getUserDir(username)
# - `/tmp/crewfactory/${username}/workspace` -> getWorkspaceDir(username)
# - `/tmp/crewfactory/${username}/sessions/${sessionId}` -> getSessionDir(username, sessionId)
# - etc.

# Script de reemplazo masivo (dry-run primero):
rg -l "/tmp/crewfactory" apps/server/src/ --include="*.ts" > /tmp/paths-to-migrate.txt

# Revision manual de cada archivo es necesaria porque los patrones varian
# (template literals vs concatenacion vs join())
```

---

## Checklist de Implementacion

- [ ] 1. Crear `packages/shared/src/paths.ts` con todas las funciones de path
- [ ] 2. Exportar desde `packages/shared/src/index.ts`
- [ ] 3. Reemplazar paths hardcodeados en `session-manager.ts`
- [ ] 4. Reemplazar paths hardcodeados en `routes/files.ts`
- [ ] 5. Reemplazar paths hardcodeados en `ws/handler.ts`
- [ ] 6. Reemplazar paths hardcodeados en `mcp-registry.ts`
- [ ] 7. Reemplazar paths hardcodeados en `audit-log.ts`
- [ ] 8. Reemplazar paths hardcodeados en `routes/sessions.ts`
- [ ] 9. Reemplazar paths hardcodeados en `routes/backup.ts`
- [ ] 10. Reemplazar paths hardcodeados en `routes/skills.ts`
- [ ] 11. Reemplazar paths hardcodeados en `routes/integrations.ts`
- [ ] 12. Reemplazar paths hardcodeados en `routes/gallery.ts`
- [ ] 13. Reemplazar paths hardcodeados en `routes/mcp.ts`
- [ ] 14. Reemplazar paths hardcodeados en `routes/channels.ts`
- [ ] 15. Reemplazar paths hardcodeados en `routes/preview.ts`
- [ ] 16. Reemplazar paths hardcodeados en `preview-server.ts`
- [ ] 17. Reemplazar paths hardcodeados en `preview-config.ts`
- [ ] 18. Reemplazar paths hardcodeados en `preview-builder.ts`
- [ ] 19. Reemplazar paths hardcodeados en `channel-store.ts`
- [ ] 20. Reemplazar paths hardcodeados en `channel-orchestrator.ts`
- [ ] 21. Reemplazar paths hardcodeados en `experiment-store.ts`
- [ ] 22. Reemplazar paths hardcodeados en `agent-registry.ts`
- [ ] 23. Reemplazar paths hardcodeados en `create-agent-server.ts`
- [ ] 24. Reemplazar paths hardcodeados en `baseline-runner.ts` y `harness.ts`
- [ ] 25. Reemplazar paths hardcodeados en `default-factory-skills.ts`
- [ ] 26. Crear `scripts/docker-entrypoint.sh`
- [ ] 27. Crear `scripts/migrate-paths.ts`
- [ ] 28. Actualizar `Dockerfile` (entrypoint, sin mkdir build-time)
- [ ] 29. Actualizar `docker-compose.yml` (volumen en /app/data)
- [ ] 30. Actualizar `.dockerignore`
- [ ] 31. Crear `.env.example`
- [ ] 32. Actualizar `coolify-template.json`, `blueprints/`
- [ ] 33. Validar compilacion (`tsc --noEmit` server + client)
- [ ] 34. Validar build Docker
- [ ] 35. Desplegar en Coolify Alibaba con docker-compose
- [ ] 36. Verificar que datos existentes migran correctamente
