# Next Steps — CrewFactory

> Ideas y prioridades para las próximas iteraciones.

---

## 1. Dashboard → Chat por defecto (Modo Global) ✓

Que al entrar, en lugar de una landing vacía, se abra directamente el chat con el asistente global. El usuario puede usar la app desde el primer momento sin necesidad de crear un proyecto.

- Ruta `/` redirige a `/chat` o el dashboard muestra el chat como contenido principal
- El asistente global (modo global) es la experiencia por defecto
- Proyectos/repos quedan como funcionalidad secundaria accesible desde sidebar

---

## 2. Visibilidad del estado de sesiones ✓

Indicadores visuales del estado de cada sesión en el sidebar:

- `🟢 Activa` — sesión lista, esperando input
- `🟡 Streaming` — sesión generando respuesta
- `🔴 Ejecutando tarea` — task runner o agente trabajando
- `💤 Durmiendo` — sesión inactiva / timeout

Podría mostrarse como un badge o punto de color en cada ítem del `SessionSidebar`.

---

## 3. Mejora de integraciones

### 3.1 Skill por defecto: "Cómo usar integraciones"

Crear una skill precargada que enseñe al usuario cómo gestionar integraciones: conectar servicios, crear templates, asignar quick actions.

### 3.2 Integraciones como skills + quick actions

Cada integración puede partir de una skill y tener acciones rápidas asociadas:

- **GitHub Skill**: buscar repos, crear PRs, listar issues
- **Cloudflare Skill**: deploy worker, purgar cache, listar zones
- **Neon Skill**: crear branch, reset DB, listar proyectos
- **Coolify Skill**: deploy, restart, ver logs

### 3.3 (Futuro) Registro de operaciones + auto-generación de quick actions

Llevar un registro de las operaciones más frecuentes que ejecuta el agente por usuario. Procesar esa data periódicamente para sugerir o crear automáticamente quick actions personalizadas basadas en el uso real.

---

## 4. Templates de proyecto

Tres templates iniciales:

| Template | Stack |
|----------|-------|
| **Frontend** | React + Vite + TypeScript + Tailwind + shadcn |
| **API CRUD** | Hono + Node + Drizzle + Neon (Cloudflare Worker) |
| **Full Stack** | Frontend + API combinados |

Cada template debe ser desplegable con un clic (Coolify o Cloudflare).

---

## 5. Agentes especializados

Tipo de entidad ejecutable que se invoca con:

- Skills precargadas
- System prompt especializado
- Objetivo concreto

El agente ejecuta la tarea, reporta el resultado y termina. Similar a un "modo foco" o sub-agente invocable desde el chat principal.

Ejemplos:
- "Agente de testing" — recibe código, genera tests, los ejecuta y reporta cobertura
- "Agente de migraciones" — analiza schema actual, genera migraciones, las aplica
- "Agente de deploy" — ejecuta el pipeline de build + deploy y reporta URL

---

## 6. Actualizar contraseña ✓

Endpoint y UI para cambiar la contraseña del usuario autenticado.

- `PUT /api/auth/password` — cambia la contraseña (requiere contraseña actual + nueva)
- UI en Settings > Account

---

## 8. Preview de proyectos (Live Render)

Página para renderizar aplicaciones construidas por el agente (React, HTML, etc.) directamente dentro de la app, sin salir al navegador.

### Enfoque: iframe + build output servido estáticamente

El método más robusto y mantenible:

1. El agente construye la app dentro del workspace (`workspace/repos/{repo}/`)
2. El `dist/` o `build/` resultante se sirve via un endpoint estático
3. La UI abre un iframe apuntando a ese endpoint

**Backend:**
- Endpoint `GET /api/files/preview/{repo}/*` — sirve archivos estáticos desde `workspace/repos/{repo}/dist/`
- Soporte para SPA routing (fallback a `index.html`)
- Cabeceras MIME correctas y `X-Frame-Options` configurado

**Frontend:**
- Nueva pestaña/página "Preview" en el panel de proyecto
- Iframe con toolbar: recargar, abrir en nueva pestaña, modo responsive (375px/768px/1280px)
- Indicador de "building..." mientras el agente construye

**Alternativa futura (dev mode):**
- Proxy a Vite dev server para hot-reload mientras el agente desarrolla
- Requiere gestionar puertos efímeros — el iframe build-output cubre el 90% de los casos

**Ventajas de este enfoque:**
- Framework-agnóstico (React, Vue, Svelte, HTML plano)
- Sin dependencias externas (Sandpack, WebContainer, etc.)
- El agente controla el build — misma salida que en producción
- Escalable: cualquier proyecto con un `dist/` se puede previsualizar

---

## 9. API Reference para el agente

Documentación estructurada de toda la API para que el agente pueda ejecutar operaciones contra el backend. Autenticación vía `Authorization: Bearer <token>` (excepto login y health). El token se obtiene de `localStorage.getItem("token")`.

---

### Auth — `/api/auth`

| Método | Path | Descripción | Body |
|--------|------|-------------|------|
| POST | `/api/auth/login` | Login, devuelve JWT | `{ username, password }` |
| POST | `/api/auth/password` | Cambiar contraseña | `{ currentPassword, newPassword }` |
| GET | `/api/auth/me` | Info del usuario autenticado | — |

---

### Sesiones — `/api/sessions`

| Método | Path | Descripción | Body / Params |
|--------|------|-------------|---------------|
| GET | `/api/sessions` | Listar sesiones | — |
| POST | `/api/sessions` | Crear sesión | `{ name, repoName? }` |
| PATCH | `/api/sessions/:id` | Renombrar | `{ name }` |
| DELETE | `/api/sessions/:id` | Eliminar sesión | — |
| GET | `/api/sessions/:id/messages` | Mensajes de la sesión | — |
| POST | `/api/sessions/:id/prompt` | Enviar prompt (REST) | `{ message }` |
| POST | `/api/sessions/:id/abort` | Abortar generación | — |
| POST | `/api/sessions/:id/navigate` | Navegar árbol de mensajes | `{ targetId }` |
| POST | `/api/sessions/:id/model` | Cambiar modelo | `{ provider, modelId, thinkingLevel? }` |
| GET | `/api/sessions/:id/context` | Uso de contexto | — |
| GET | `/api/sessions/:id/skills` | Skills activas de la sesión | — |
| GET | `/api/sessions/:id/tools` | Tools activas | — |
| POST | `/api/sessions/:id/tools` | Setear tools | `{ tools: string[] }` |
| GET | `/api/sessions/:id/tasks` | Estado del task runner | — |
| POST | `/api/sessions/:id/tasks` | Guardar tasks | `{ tasks }` |
| POST | `/api/sessions/:id/tasks/decompose` | Descomponer objetivo | `{ objective }` |
| POST | `/api/sessions/:id/tasks/run` | Ejecutar tasks | — |
| POST | `/api/sessions/:id/tasks/pause` | Pausar tasks | — |
| POST | `/api/sessions/:id/tasks/reset` | Resetear tasks | — |

---

### Providers — `/api/providers`

| Método | Path | Descripción | Body |
|--------|------|-------------|------|
| GET | `/api/providers` | Listar providers con estado de auth | — |
| GET | `/api/providers/:id/models` | Modelos de un provider | — |
| POST | `/api/providers/:id/key` | Setear API key | `{ apiKey }` |
| DELETE | `/api/providers/:id/key` | Eliminar API key | — |

---

### Models — `/api/models`

| Método | Path | Descripción |
|--------|------|-------------|
| GET | `/api/models` | Modelos disponibles (configurados + autenticados) |

---

### Workspace / Archivos — `/api/workspace`

Soporta `?repo=nombre` para operar dentro de un repositorio específico.

| Método | Path | Descripción | Body / Query |
|--------|------|-------------|-------------|
| GET | `/api/workspace` | Listar raíz del workspace | `?repo=` |
| GET | `/api/workspace/*` | Leer archivo o directorio | `?repo=`, `?raw=1`, `?download=1` |
| PUT | `/api/workspace` | Crear archivo/carpeta en raíz | `{ type:"file"|"folder", content? }` + `?repo=` |
| PUT | `/api/workspace/*` | Crear archivo/carpeta en subruta | `{ type, content? }` + `?repo=` |
| POST | `/api/workspace` | Subir archivo (multipart) a raíz | `FormData(file)` + `?repo=` |
| POST | `/api/workspace/*` | Subir archivo (multipart) a subruta | `FormData(file)` + `?repo=` |
| DELETE | `/api/workspace` | Eliminar archivo/carpeta en raíz | `?repo=` |
| DELETE | `/api/workspace/*` | Eliminar archivo/carpeta en subruta | `?repo=` |
| PATCH | `/api/workspace` | Renovar/mover en raíz | `{ newPath }` + `?repo=` |
| PATCH | `/api/workspace/*` | Renovar/mover en subruta | `{ newPath }` + `?repo=` |

### Workspace Repos — `/api/workspace-repos`

| Método | Path | Descripción | Body |
|--------|------|-------------|------|
| GET | `/api/workspace-repos` | Listar repos del usuario | — |
| POST | `/api/workspace-repos` | Crear o clonar repo | `{ name, cloneUrl? }` |

### Session Files (legacy) — `/api/sessions/:sessionId/files/*`

| Método | Path | Descripción |
|--------|------|-------------|
| GET | `/api/sessions/:sessionId/files/*` | Stream de archivos de sesión (compatibilidad) |

---

### Integrations — `/api/integrations`

| Método | Path | Descripción | Body |
|--------|------|-------------|------|
| GET | `/api/integrations/templates` | Templates de integraciones | — |
| POST | `/api/integrations/templates` | Guardar templates | `{ templates }` |
| GET | `/api/integrations/bindings/:repoName` | Bindings de un repo | — |
| POST | `/api/integrations/bindings/:repoName` | Guardar bindings | `Record<string, string>` |

---

### Skills — `/api/skills`

| Método | Path | Descripción |
|--------|------|-------------|
| GET | `/api/skills` | Skills globales del workspace |

---

### Environment Variables — `/api/env`

| Método | Path | Descripción | Body / Query |
|--------|------|-------------|-------------|
| GET | `/api/env` | Listar env vars (valores ocultos) | `?reveal=true` |
| POST | `/api/env` | Setear una env var | `{ key, value }` |
| PUT | `/api/env` | Bulk replace env vars | `{ variables: Record<string, string> }` |
| DELETE | `/api/env/:key` | Eliminar env var | — |

---

### Health — `/api/health`

| Método | Path | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Health check |

---

### WebSocket — `/ws`

**Conexión:** `new WebSocket("/ws")`, luego enviar `{ type: "auth", token, sessionId? }`.

**Mensajes Cliente → Servidor:**

| Type | Descripción | Payload |
|------|-------------|---------|
| `auth` | Autenticar conexión | `{ token, sessionId? }` |
| `prompt` | Enviar prompt (streaming) | `{ sessionId, message, tools? }` |
| `steer` | Intervenir generación activa | `{ sessionId, message }` |
| `follow_up` | Enviar follow-up | `{ sessionId, message }` |
| `abort` | Abortar generación | `{ sessionId }` |
| `compact` | Compactar contexto | `{ sessionId }` |
| `get_context_usage` | Pedir uso de contexto | `{ sessionId }` |

**Mensajes Servidor → Cliente:**

| Type | Descripción |
|------|-------------|
| `auth_success` / `auth_error` | Resultado de autenticación |
| `agent_start` / `agent_end` | Inicio/fin de ejecución del agente |
| `message_start` / `message_update` / `message_end` | Eventos de streaming de mensajes |
| `context_usage` | Uso de contexto actual |
| `session_status` | Cambio de estado de sesión (`streaming`/`active`) |
| `agent_error` | Error del agente |
| `aborted` | Confirmación de aborto |
