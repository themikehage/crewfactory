# Next Steps — Pi Web Wrapper

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

## 9. CLI / API Docs para el workspace

Documentación (tutorial o sección en UI) que enseñe a los usuarios:

- Cómo está estructurado su workspace
- Cómo hacer peticiones directas a la API del backend
- Cómo usar los endpoints de sesiones, archivos, integraciones
- Ejemplos con curl para automatizar tareas fuera de la UI
