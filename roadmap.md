# CrewFactory — Roadmap

> Contexto: copiloto + piloto autónomo para flujo freelance multi-proyecto con Cloudflare, Neon, Coolify, GitHub, Notion, servicios de imagen.
> Referentes: Claude Code, Codex CLI, Lovable, Cursor.

---

## Estado actual

El wrapper tiene una base sólida:
- Auth JWT, multi-sesión WebSocket, streaming en tiempo real
- Workspace aislado por usuario con modo global y modo repo
- Skills library, file explorer, provider/model manager
- Dashboard de repos (crear / clonar)
- Deploy en Coolify vía Docker

El wrapper tiene una base sólida con las 3 features de alto impacto ya implementadas (Task Runner, Tool Permissions, Integrations Hub). El foco actual es el **Context Window Meter** para dar visibilidad del consumo de tokens durante runs largos.

---

## 5 Features de Alto Impacto

### 1. Sistema de Tareas con Estado Persistente (Task Runner) ✅ COMPLETED

**El gap más grande frente a Claude Code / Codex.**

- ✅ `tasks.json` por sesión con estados (pending/running/done/failed)
- ✅ Endpoint `POST /api/sessions/:id/tasks/decompose`
- ✅ Auto-continuación (loop supervisor asíncrono en backend)
- ✅ UI: Tasks panel lateral con progress tracker, logs, pause/resume/reset

---

### 2. Tool Permissions por Sesión + Modo Read-Only ✅ COMPLETED

**Seguridad y control antes de darle el timón al agente.**

- ✅ Panel "Session Tools" con checkboxes (7 tools)
- ✅ Presets Full Access / Read-Only
- ✅ `session.setActiveToolsByName()` del SDK
- ✅ Persistencia en `metadata.json`
- ✅ Sandbox badge en header del chat

---

### 3. Integrations Hub — Acciones Autónomas de Infraestructura ✅ COMPLETED

**Donde pi se diferencia de cualquier chat UI.**

- ✅ Registro de integraciones configuradas (tokens, endpoints) en `integrations.json`
- ✅ UI de Integrations en Settings con editor de templates
- ✅ Panel de bindings por repo con variables de contexto
- ✅ Quick Action buttons que disparan prompts con variable replacement

---

### 4. Context Window Meter + Message Queueing

**Productividad táctica durante runs largos.**

**Message Queueing ✅ COMPLETED**
- ✅ Input activo durante streaming
- ✅ `Enter` = `steer` (WebSocket)
- ✅ `Alt+Enter` = `follow_up` (WebSocket)
- ✅ Placeholder con instrucciones de teclado

**Context Meter ⏳ PENDIENTE**
- Barra de progreso en el footer del chat: `68% de 200k tokens`
- Botón "Compact" manual (el SDK ya lo soporta con `compact()`)
- Warning cuando se acerca al límite

---

### 5. Session Export + Share to Gist / Notion ⏳ PENDIENTE

**El output del trabajo tiene que salir del chat.**

Cuando terminas un proyecto o una sesión de debug larga, el resultado queda atrapado en el chat. Necesitas:

- **Export HTML/JSONL**: botón en el header de sesión que descarga la conversación completa con tool calls y outputs formateados
- **Share to Gist**: llama a la GitHub API con el token ya configurado en el Integration Hub, crea un Gist privado/público con la sesión exportada
- **Push to Notion**: crea una página en un workspace de Notion con el resumen de la sesión (ideal para documentar decisiones técnicas de proyectos con clientes)
- **El agente puede auto-documentar**: al final de una tarea completada, el Task Runner puede triggear un export automático a Notion

**Por qué quinto:** Cierra el loop de valor. El trabajo del agente se convierte en documentación entregable para clientes o en referencia para proyectos futuros.

---

## 5 Nice-to-Have Features

### 6. Live Preview Panel (HTML/React)

Render en tiempo real de lo que el agente genera. Cuando el agente escribe un componente React o una página HTML, un panel lateral lo renderiza instantáneamente (iframe con hot-reload vía WebSocket). Similar a Lovable/Bolt. Requiere un pequeño servidor de preview embebido.

---

### 7. Multi-Agente Paralelo (Split View)

Dos sesiones corriendo en paralelo en split-view. Útil para: un agente escribe el backend, otro escribe el frontend. O uno refactoriza mientras otro escribe tests. El dashboard muestra ambas sessiones con sus estados de streaming en tiempo real.

---

### 8. Diff Viewer Integrado + Approval Flow

Antes de que el agente aplique cambios destructivos (sobreescribir archivos, ejecutar migraciones), mostrar un diff unificado y pedir aprobación explícita. Integra con el Tool Permission system. Eleva la confianza del usuario para darle más autonomía al agente.

---

### 9. Repo Intelligence Panel

Panel que se genera al abrir un repo por primera vez: el agente analiza la estructura, identifica el stack, lee los README y genera un resumen indexado. Luego ese contexto se carga automáticamente en cada nueva sesión de ese repo (vía `memories/repos/`). Reduce drásticamente el tiempo de onboarding a proyectos que no has tocado en semanas.

---

### 10. Workspace Activity Feed + Notifications

Feed cronológico de actividad del workspace: "agente completó 3 archivos en `my-saas`", "PR abierto en GitHub", "deploy completado en Coolify", "DB branch creado en Neon". Con notificaciones push (Web Notifications API) para cuando el agente termina una tarea larga en background. Esencial para el flujo multiproyecto donde tienes varias cosas corriendo.

---

## Orden de Implementación Sugerido

```
✅ Phase 13: Tool Permissions (prereq de todo lo autónomo)
  └── 13.1 API: setActiveTools por sesión
  └── 13.2 UI: Session Tools panel + presets

✅ Phase 14: Context Meter (Queue) + Message Queueing
  └── 14.1 Footer: token usage bar + compact button ⏳
  └── 14.2 Input: steer/follow_up durante streaming ✅

✅ Phase 15: Task Runner
  └── 15.1 Backend: tasks.json schema + supervisor loop
  └── 15.2 API: /api/sessions/:id/task
  └── 15.3 UI: Tasks panel con progress tracker

✅ Phase 16: Integrations Hub
  └── 16.1 Backend: integration registry + credential store
  └── 16.2 UI: Settings > Integrations (GitHub, CF, Neon, Coolify, Notion)
  └── 16.3 Repo context panel con acciones rápidas

⏳ Phase 17: Export + Share
  └── 17.1 Export HTML/JSONL
  └── 17.2 Share to Gist
  └── 17.3 Push to Notion
```
