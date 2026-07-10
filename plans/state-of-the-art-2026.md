# State of the Art — AI Agent Platforms (Julio 2026)

## Resumen Ejecutivo

Tres plataformas dominan el panorama: **Cursor** (Anysphere), **Devin Desktop**
(Cognition, ex-Windsurf), y **Claude Code** (Anthropic). GitHub Copilot y OpenAI
Codex completan el ecosistema como plataformas empresariales y multi-superficie.

Hay 3 macros-tendencias:

1. **Multi-agent heterogeneo** — no solo multiples agentes del mismo proveedor,
   sino agentes de distintos vendors (ACP protocol de Devin, A2A de Google)
2. **Contexto compartido entre agentes** — Spaces, side chats, memoria persistente
3. **Observabilidad como requisito** — no es un "nice to have", es parte del core

---

## 1. Tendencias de Arquitectura

### A2A + MCP como estandar dual

- **MCP** (Model Context Protocol): conecta agentes a herramientas externas.
  Ya es "USB-C para AI". SDKs oficiales para TS, Python, Java, Kotlin, C#.
  Nuevo: transport Streamable HTTP con OAuth + durable execution wrappers (`Tasks`).
- **A2A** (Agent-to-Agent, Google): permite que agentes de distintos frameworks
  se descubran y comuniquen via HTTP. Microsoft Agent Framework 1.0 ya lo incluye.
- CrewFactory ya tiene MCP integrado. Lo que falta es explotar su ecosistema
  (galeria curada, server-side logging, durable execution).

### Durable Execution (Supervivencia a Fallos)

LangGraph y Deep Agents popularizaron el patron: los agentes persisten su estado
en cada paso, permitiendo resumes tras crashes. CrewFactory no tiene esto —
si el servidor se cae durante un prompt, todo el estado en memoria se pierde.

### Aislamiento de Contexto por Subagente

En vez de meter todo en un solo contexto (que se llena), los subagentes ejecutan
tareas pesadas en contextos frescos y devuelven solo resultados comprimidos.
CrewFactory implemento esto via `delegation-registry` + `terminate: true` —
es correcto, pero le falta compresion de resultados y memoria a largo plazo.

---

## 2. Funcionalidades de Alto Valor para CrewFactory

### 2.1 Session Dashboard tipo Kanban (Devin Desktop)

Devin Desktop tiene un **Agent Command Center**: un kanban que muestra todos los
agentes activos, su estado (planning, running, review, done), y permite
spawnear nuevos desde un Launchpad.

**Que hariamos**: 
- Reemplazar la lista plana de sesiones con un kanban o timeline
- Cada "sesion" de agente es una card en el kanban
- Filtros por estado, tipo (chat, delegacion, experimento), contexto
- Boton "spawn agent" que abre un modal quick-start

**Dificultad**: Media
**Impacto**: Alto (claridad visual de lo que esta pasando)

### 2.2 Shared Context / Spaces (Devin Desktop + Cursor)

Cursor tiene **Side Chats** (`/side`, `/btw`) y Devin tiene **Spaces** — contexto
compartido entre sesiones de agente. Un space agrupa sesiones, PRs, archivos, y
un `AGENTS.md` compartido.

**Que hariamos**:
- Un "project context" que persiste entre sesiones del mismo proyecto
- Memoria compartida entre sesiones (`AGENTS.md` por proyecto + por agente)
- Side chats no-interruptivos (el usuario puede abrir un chat lateral mientras
  el agente principal sigue trabajando)

**Dificultad**: Baja (la mayoria de la infra ya existe)
**Impacto**: Alto

### 2.3 Cloud Agents con Handoff (Cursor + Devin)

Cursor permite hacer handoff de un agente local a un agente cloud. El agente
cloud corre en una VM aislada, sigue trabajando aunque cierres el portatil,
y produce videos/screenshots de su trabajo.

**Que hariamos**:
- Un toggle "Local / Remoto" en la UI
- Modo remoto: el agente corre en un worker de Coolify
- El usuario puede cerrar la pestana y volver despues
- Notificaciones push cuando el agente termina

**Dificultad**: Alta (requiere infraestructura cloud)
**Impacto**: Muy alto (diferencia competitiva real)

### 2.4 Automations (Cursor + Claude Code)

Cursor tiene **Automations**: agentes disparados por schedules, eventos de
GitHub (PR, issue, workflow), Slack, webhooks. Claude Code tiene **Routines**.
Ambos permiten `/automate` "cada lunes a las 9am revisa mis PRs abiertos".

**Que hariamos**:
- Sistema de "recetas" o "rutinas": schedules + triggers
- UI para crear rutinas: "Cuando X evento ocurra, ejecuta Y prompt en Z agente"
- Ejemplos: "Analiza cada PR nuevo", "Cada manana revisa las issues sin asignar"

**Dificultad**: Media
**Impacto**: Alto (productividad diferida)

### 2.5 Revision de PR Automatica (todos)

Todos los competidores tienen AI Code Review integrado. GitHub Copilot lo tiene
nativo en PRs, Cursor tiene Bugbot, Claude Code via GitHub App.

**Que hariamos**:
- Endpoint que recibe webhooks de GitHub para PR events
- Un agente especializado "code-reviewer" que analiza el diff
- Comentarios en el PR con hallazgos
- Auto-fix para problemas simples (formato, tipos, tests faltantes)

**Dificultad**: Media-alta (depende de integracion GitHub)
**Impacto**: Alto

### 2.6 Memoria Persistente y Aprendizaje entre Sesiones

Claude Code tiene `CLAUDE.md` + auto-memoria, Copilot tiene **Copilot Memory**
administrada por organizacion, Codex tiene `AGENTS.md` + `Memories` + `Chronicle`.

**Que hariamos**:
- El agente puede guardar hechos, preferencias, y decisiones en un archivo
  `memories.json` por proyecto
- En cada inicio de sesion, las memorias relevantes se inyectan al prompt
- Las habilidades (skills) que el agente usa frecuentemente se priorizan
- Auto-aprendizaje: "La ultima vez que hice X, use Y stack, funciono"

**Dificultad**: Baja-media
**Impacto**: Alto (cada sesion es mas inteligente que la anterior)

### 2.7 Subagentes con Modelos Diferentes (Cursor)

Cursor permite que subagentes usen distintos modelos segun la tarea: Opus para
editar, GPT-5.6 para construir, Gemini para planificar.

**Que hariamos**:
- En `spawn_subagent`, permitir especificar `modelHint` o `provider`
- El sistema elige el modelo optimo segun la tarea (vision, reasoning, rapido)
- Auto-seleccion: "esta tarea es de analisis → mejor modelo para reasoning"

**Dificultad**: Baja
**Impacto**: Medio (mejor calidad por tarea)

### 2.8 Side-by-Side Diff Review (todos)

Todos los competidores muestran diffs inline con aceptar/rechazar. Cursor tiene
Composer con checkpoints git.

**Que hariamos**:
- Cuando el agente propone cambios, mostrar diff side-by-side en la UI
- Botones Aceptar/Rechazar por archivo
- Checkpoint git automatico antes de cada cambio grande
- Rollback con un clic

**Dificultad**: Media
**Impacto**: Alto (control del usuario sobre los cambios)

### 2.9 Plan Mode + Approbacion por Paso (Copilot)

GitHub Copilot tiene tres modos de agente: **Plan** (planifica antes de codificar),
**Agent** (ejecuta), **Ask** (solo responde). El modo Plan muestra un plan paso a
paso que el usuario revisa antes de ejecutar. CrewFactory ya tiene
`decompose_tasks` pero no esta integrado como un modo pre-ejecucion.

**Que hariamos**:
- Boton "Plan first" que fuerza al agente a descomponer la tarea antes de actuar
- El plan se muestra como una lista de pasos que el usuario aprueba
- Cada paso se ejecuta individualmente con confirmacion
- Modos: "Automatico", "Semi-automatico" (aprueba plan, ejecuta automatico),
  "Manual" (aprueba cada paso)

**Dificultad**: Media
**Impacto**: Alto (confianza del usuario en el agente)

### 2.10 Canal de Comunicacion Agente-Usuario

Claude Code tiene **Channels**: Telegram, Discord, iMessage → sesion de agente.
Cursor tiene **Slack integration**: @Cursor lanza agentes desde Slack.

**Que hariamos**:
- Webhook entrante: enviar un prompt al agente via HTTP POST
- El agente responde por el mismo canal
- Integracion con Slack/Telegram/Discord como canales de salida
- Notificaciones push cuando el agente completa una tarea larga

**Dificultad**: Media
**Impacto**: Alto (el agente no requiere abrir el navegador)

### 2.11 Vista de Time Travel / Session Replay

Idea: poder "rebobinar" una sesion de agente y ver exactamente que paso en cada
momento. Como el log de herramientas pero con playback.

**Que hariamos**:
- Cada evento de tool_call + tool_result se guarda con timestamp
- El usuario puede hacer scrub en una linea de tiempo
- "Mostrame el estado del workspace cuando el agente hizo esta tool call"

**Dificultad**: Alta
**Impacto**: Medio (debugging de agentes)

### 2.12 Sandbox Mode para Ejecucion de Codigo

Cursor tiene Cloud Agents con "computer use". Claude Code tiene bash/spawn
en sandbox. Codex tiene cloud environments.

**Que hariamos**:
- Boton "Run in sandbox" que ejecuta el codigo del agente en un contenedor
  aislado (Docker)
- El sandbox tiene el repositorio, dependencias instaladas, y acceso de red
- El agente puede ejecutar comandos, ver output, y iterar
- Ideal para "instala las deps y corre los tests"

**Dificultad**: Alta (infraestructura Docker)
**Impacto**: Muy alto (pasar de "codigo que escribi" a "codigo que funciona")

### 2.13 Agente como API (API-first)

Codex y Copilot tienen SDKs para construir sobre el agent loop. CrewFactory
tiene API endpoints para prompts, pero no un SDK completo.

**Que hariamos**:
- Exponer el AgentLoop como API REST + WebSocket con SDK
- `POST /api/agents/:id/run` — ejecuta un agente con un prompt, devuelve
  un stream de eventos
- `POST /api/agents/:id/delegate` — delega a un agente programatico
- Cliente SDK en TypeScript para integrar agents en otras apps

**Dificultad**: Media
**Impacto**: Alto (CrewFactory como plataforma, no solo UI)

### 2.14 Pricing con Creditos de IA (Copilot)

GitHub Copilot introdujo creditos de IA (1 credit = $0.01) como moneda granular.
Cada llamada al LLM consume creditos. El usuario ve cuantos creditos gasta por
sesion.

**Que hariamos**:
- Mostrar costo estimado por sesion (deadline, no implementacion real)
- Basado en tokens consumidos (que ya trackeamos)
- Proyeccion de costo por tarea
- Alerta cuando una sesion esta consumiendo muchos tokens

**Dificultad**: Baja
**Impacto**: Medio (transparencia para el usuario)

---

## 3. Priorizacion Recomendada

### Must-Have (diferencia competitiva real)

| # | Feature | Esfuerzo | Impacto |
|---|---------|----------|---------|
| 1 | **Contexto compartido entre sesiones** | 2-3d | Alto |
| 2 | **Plan Mode + aprobacion por paso** | 3-5d | Alto |
| 3 | **Diff side-by-side con aceptar/rechazar** | 3-5d | Alto |
| 4 | **Side chats no-interruptivos** | 2-3d | Alto |

### Should-Have (mejora significativa)

| # | Feature | Esfuerzo | Impacto |
|---|---------|----------|---------|
| 5 | **Memoria persistente entre sesiones** | 2-3d | Alto |
| 6 | **Automations (rutinas + triggers)** | 5-8d | Alto |
| 7 | **Canal Slack/Telegram/Discord** | 3-5d | Medio |
| 8 | **Subagentes con modelos optimos** | 1-2d | Medio |

### Could-Have (diferenciador a largo plazo)

| # | Feature | Esfuerzo | Impacto |
|---|---------|----------|---------|
| 9 | **Cloud Agents with handoff** | 10-15d | Muy alto |
| 10 | **Sandbox mode (Docker)** | 8-12d | Muy alto |
| 11 | **PR Review automatico** | 5-8d | Alto |
| 12 | **Session Dashboard Kanban** | 5-8d | Alto |

---

## 4. Lo que CrewFactory YA tiene bien

No todo es deuda. CrewFactory ya tiene varias cosas que los competidores recien
estan adoptando:

- **Multi-agente nativo**: spawn/delegate con sesiones aisladas y contextos
  frescos. Cursor apenas lo esta haciendo bien con subagentes.
- **MCP integrado**: galeria, servers custom, conexion/test. Devin Desktop
  recien lo integra via ACP.
- **Streaming en tiempo real**: WebSocket con events para tool calls, thinking,
  texto. Cursor usa el mismo patron.
- **Sesiones persistentes**: sobreviven a refrescos de pagina. Claude Code
  recien tiene sesiones en escritorio.
- **Tools modulares**: cada tool es una funcion independiente. Copilot tiene
  hooks similares pero mas complejos.
- **Tres tipos de agente**: chat, programatico, canal. Codex recien esta
  explorando multi-rol.
- **Laboratorio de experimentos**: comparacion A/B de agentes. Ningun
  competidor tiene esto.
- **Provider dinamico**: cambiar de modelo sobre la marcha. Cursor tiene modelos
  built-in, no intercambiables.
- **Auditoria de seguridad**: filtrado de secrets, env vars encriptadas,
  anti-suicidio. Copilot lo tiene como Enterprise feature.

**La ventaja de CrewFactory**: no es solo un IDE, es un **orquestador de
agentes** que puede manejar multiples proveedores, roles, y contextos desde una
sola interfaz web. Los competidores estan yendo hacia ahi (Devin Desktop con
ACP, Cursor con subagentes) pero CrewFactory ya tiene la arquitectura base.
