# Plans

Cada archivo `.md` en esta carpeta documenta una funcionalidad propuesta para implementar más adelante.
Los planes completados se mueven a [`COMPLETED/`](./COMPLETED/).

## Pendientes

### Production Readiness (Audit 2026-07-10)

- **10 Critical** → [fix-critical.md](./fix-critical.md) — Catch block mata sesion, steer/followUp mismo queue, JWT sin re-verify, AgentSession bypassa Agent class, solo 1 provider, all.ts roto, 0 tests, node.ts roto, auth import roto, types.ts imports rotos
- **12 High** → [fix-high.md](./fix-high.md) — Pre-loop throw, navigateTree corrupts messages, steer duplicado, sendContextUsage mata pipe, out-of-order WS messages, tool_execution_update dropped, AgentHarness no usado, compact stub, message_update filtering, vendor sync
- **30 Medium** → [fix-medium.md](./fix-medium.md) — emit() traga errores, race abortController, dispose sin await, constructor inseguro, session dir race, authStorage any, dynamic import, bash hardcode, persist sin rollback, rewrite full file, image tokens, WS jitter/retries/queue, channel_join cleanup
- **15 Low** → [fix-low.md](./fix-low.md) — Context type mismatch, token naming, steer warning, undefined return, compact stub, auth error feedback, EXEC/LAB silent, TOCTOU race, disconnect feedback, network errors, turn events, unknown event log, barrel export
- **10 Delegation** → [fix-delegation.md](./fix-delegation.md) — role:user en vez de toolResult, doble toolCallId, forwardSubagentEvents sin fallback, parent muerto silencioso, wakeMessage duplicado, includeFullHistory sin truncar, FloatingDelegations no renderizado, DelegationsPanel sin WS events, type guards, sanitize URL

### Refactoring

- [unify-lab-channel-orchestration.md](./unify-lab-channel-orchestration.md) — Unificar orquestracion del laboratorio con `ChannelOrchestrator`: el lab debe consumir el subsistema de canales como cliente en lugar de reinventar el pipeline completo (gen, channel, dispatch, tokens, destroy). ~500 lineas eliminadas.

### Bug Fixes

- [fix-experiments-eager-fetch.md](./fix-experiments-eager-fetch.md) — `fetchExperiments()` se dispara en `/onboard` y `/` sin autenticacion, causando requests HTTP 401 innecesarios. SessionSidebar duplica el fetch. Plan: auth guard + hook `useExperiments` + dedup
- [fix-chat-render-loop.md](./fix-chat-render-loop.md) — Maximum update depth exceeded en ChatArea por `dependencies: [messages]` inline array que dispara efecto de `useChatScroll` en cada render
- [fix-experiment-flickering.md](./fix-experiment-flickering.md) — El contenido de variantes de experimento aparece y desaparece (flickering) por 4 causas: useChannel limpia mensajes prematuramente, el canal se destruye al finalizar cada variante, no hay handler de experiment_status en el cliente, y ejecucion fire-and-forget. Fix en 3 fases: flickering inmediato, preservar historial, canales persistentes con "send message to channel".
- [channel-non-streaming-render.md](./channel-non-streaming-render.md) — Los canales multi-agente renderizan mensajes en streaming caracter-por-caracter, creando caos visual cuando varios agentes escriben a la vez. Fix: buffer que oculta mensajes parciales y solo muestra el mensaje completo al recibir channel_message, con indicador sutil de typing.

### Technical Debt

- [debt-agentsession.md](./debt-agentsession.md) — AgentSession no usa la clase `Agent` de pi: pierde state machine, colas separadas, waitForIdle, errores estructurados, compaction, tool_execution_update
- [debt-websocket.md](./debt-websocket.md) — WebSocket sin dedup en reconnect, sin indicador de conexion, sin ping de cliente, degradacion silenciosa, race en pending-prompt
- [debt-vendor-fork.md](./debt-vendor-fork.md) — Fork sin version tracking, 33 imports rotos, 8 dead types, @ts-nocheck en 5 archivos, sin proceso de sync


### Research

- [state-of-the-art-2026.md](./state-of-the-art-2026.md) — Estado del arte de plataformas AI agenticas (Cursor, Devin Desktop, Claude Code, Copilot, Codex) con 14 funcionalidades priorizadas para CrewFactory
- [sandboxing.md](./sandboxing.md) — Sandboxing profesional: Permission Engine, Docker sandbox, Network Proxy, Secret Filter, Resource Limits, UI de configuracion

### Performance

- [laboratory-efficiency-audit.md](./laboratory-efficiency-audit.md) — Auditoria de eficiencia del laboratorio: scoring injusto, system prompt inflado (1,370t desperdiciados por call), 9 AgentServer duplicados por experimento, DivergenceDetector O(n), bypass de (silent). **Ademas: 2 patrones humanos que no aplican a IA** (halago antes de corregir, repeticion de entrega completa) con solucion `Output Protocol` para canales en general: lider entrega propuesta completa, especialistas solo sugieren diff quirurgico. ~70-75% menos tokens. 8 fases.

### Features

- [better-auth-onboarding.md](./better-auth-onboarding.md) — **Better Auth + First-Run Onboarding**: Reemplazar JWT+bcrypt custom con Better Auth. Onboarding estilo Coolify: el usuario crea su cuenta admin en el primer acceso, sin manejar variables de entorno ni encriptacion. Sesiones httpOnly via cookies, SQLite como DB, multi-user ready, auto-migracion de credenciales legacy.
- [layered-prompt-audit.md](./layered-prompt-audit.md) — **Auditoria del Sistema de Prompting por Capas**: Analisis exhaustivo de robustez y coherencia del sistema de 4 capas (identidad, rol, instancia, protocolo) en canales multi-agente. Evaluacion de 8 configuraciones canonicas, matriz de riesgo, gaps detectados (senior/observer sin efecto funcional, desacople rol↔replyMode, multiples lideres). 5 fases de accion propuestas para alcanzar robustez profesional.
- [custom-tools.md](./custom-tools.md) — **Custom Tool System**: Motor de creacion de tools personalizadas por el agente LLM a demanda. Contrato Zod solido con 3 modos de ejecucion (pipeline, UI, subagent), CRUD engine con persistencia en filesystem, y motor de UI builder con 19 componentes estructurados en 3 tiers (cards, tables, media, metrics, diff, steps, etc.) + escape hatch HTML con design system inyectado.
- [manage-factory-tool.md](./manage-factory-tool.md) — Tool `manage_factory`: operaciones CRUD de fabrica en una sola tool con contrato auto-documentado. Reemplaza skills factory-x + curl por tool nativa.
- [async-delegation-spawn.md](./async-delegation-spawn.md) — Delegacion y spawn asincronos sin bloqueo del agente padre, con redireccion a sesion del subagente y tracker de delegaciones tipo FloatingTasks
- [api-error-detection.md](./api-error-detection.md) — Detectar errores silenciosos de la API cuando el LLM devuelve error en lugar de texto, mostrando mensajes de error visibles en el chat
- [delegation-spawn-improvements.md](./delegation-spawn-improvements.md) — Solucionar la navegacion automatica al iniciar delegaciones, boton de volver atras en subagentes y mover listado de delegaciones a una tab dedicada al lado de chat/files.
- [data-persistence-migration.md](./data-persistence-migration.md) — Migracion a persistencia robusta con Docker Compose
- [info-edit-button.md](./info-edit-button.md) — Boton de informacion en proyectos y agentes para ver/editar todos los datos disponibles
- [mobile-bottom-bar-redesign.md](./mobile-bottom-bar-redesign.md) — La bottombar de mobile solo se muestra cuando el drawer del menu esta abierto
- [audit-slow-operations.md](./audit-slow-operations.md) — Auditoria de rendimiento: decompose tasks, LLM judge, y export experiment: paths configurables via env vars, entrypoint con inicializacion, volumenes nombrados en /app/data, y migracion automatica de datos legacy.
- [multi-agent-primitives-refactor.md](./multi-agent-primitives-refactor.md) — Refactorizacion a 4 primitivas componibles (spawn, delegate, negotiate, arbitrate). Consolida 7+ flujos multi-agente, elimina duplicacion, extrae protocolos reutilizables.
- [laboratory-agent-experience.md](./laboratory-agent-experience.md) — Laboratorio como sesion de chat con agente + tool `create_experiment`. Iteracion conversacional sobre experimentos, formulario editable convertido en tab de visualizacion, y eliminacion de IaGenerator (800 lineas).
- [agent-channel-gallery.md](./agent-channel-gallery.md) — Galería comunitaria de plantillas de agentes y canales, con instalación en 1 clic, exportación, y curación vía PRs.
- [agent-manager-tool.md](./agent-manager-tool.md) — Tool agent_manager para delegar tareas a agentes programáticos persistentes y supervisar su ejecución en tiempo real.
- [channel-agent-validation.md](./channel-agent-validation.md) — Validacion de agentes en canales: cascade cleanup al eliminar agente, filtrado de miembros ghost en lecturas, e indicadores visuales en el cliente para agentes huerfano.
- [chat-empty-state.md](./chat-empty-state.md) — Pantalla de bienvenida estilo ChatGPT con input centrado verticalmente cuando la sesion no tiene mensajes.
- [chat-input-redesign.md](./chat-input-redesign.md) — Rediseño completo del input del chat: card flotante unificada, popovers inline, iconos, animaciones. Estilo ChatGPT/Claude.
- [chat-scroll-experience.md](./chat-scroll-experience.md) — Experiencia de scroll premium y robusta en el chat: scroll pinning inteligente, ResizeObserver y botón flotante de nuevos mensajes.

- [delegate-script-improvements.md](./delegate-script-improvements.md) — Mejoras al script delegate.ts: soporte para sesiones, listado de recursos, errores contextuales, modo verbose, timeouts.
- [engram-agent-memory.md](./engram-agent-memory.md) — Memoria persistente para agentes vía `@engram-ai-memory/core` con SQLite, embeddings ONNX locales, decay Ebbinghaus y knowledge graph.
- [env-var-obfuscation.md](./env-var-obfuscation.md) — Cifrado AES-256-GCM de env.json en reposo, filtrado de secrets en output bash, y API de revelado individual con auditoría.
- [environment-check.md](./environment-check.md)
- [exa-search-tool.md](./exa-search-tool.md) — Integración de Exa Search como tool oficial del agente. Búsqueda semántica web con highlights, filtros por dominio, categorías y freshness. Sin dependencias npm, API key gestionada via Env Vars.
- [experiment-detail-page.md](./experiment-detail-page.md) — Independización del detalle de experimento, unificación de mensajería con soporte para tools/thoughts, persistencia de ejecuciones históricas y streaming en tiempo real del LLM Judge.
- [execute-mcp-tool.md](./execute-mcp-tool.md) — Herramienta `mcp` unificada
- [export-experiment.md](./export-experiment.md) — Exportar experimento de laboratorio a entidades permanentes: agente individual (single) o canal multi-agente (con/sin líder) con agentes creados automáticamente si no existen. que encapsula toda la lógica de MCP: reemplaza la inyección asíncrona de pseudo-tools con una tool única que acepta server, tool y arguments.
- [factory-sessions-skill.md](./factory-sessions-skill.md)
- [gentle-ai-prompt-patterns.md](./gentle-ai-prompt-patterns.md) — Análisis de patrones de prompts y subdelegación de agentes extraídos de Gentle AI (SDD framework), con 12 patrones transferibles a CrewFactory y hoja de ruta de implementación.
- [mcp-marketplace.md](./mcp-marketplace.md) — Marketplace de MCPs estilo Windsurf: galeria de servidores populares, MCPs custom, conexion y exposicion de tools al agente.
- [mobile-navigation-redesign.md](./mobile-navigation-redesign.md) — Rediseño de navegación mobile estilo Slack iOS: sidebar full-screen, transiciones split-screen, topbar simplificada, touch targets optimizados.
- [subagent-live-console.md](./subagent-live-console.md) — Consola de subagentes en tiempo real: retransmisión de eventos a través del WebSocket padre, APIs de mensajes históricos y panel React premium (terminal + steps).
- [thinking-preview-line.md](./thinking-preview-line.md) — Linea animada de preview del thinking del agente cuando el acordeon esta cerrado.
- [layered-prompt-system.md](./layered-prompt-system.md) — Sistema de composicion de prompts en 4 capas (identidad, rol, instancia, protocolo) con inyeccion condicional segun deployment context. Desacopla identidad de agente del experimento y simplifica buildAgentPrompt.
- [tool-visualization-exa-memory.md](./tool-visualization-exa-memory.md) — Rendering estructurado para tools `exa_search` y `engram_store/recall/forget`: iconos, resumen de args/resultado, componentes dedicados con cards para resultados de búsqueda y memorias.
- [mobile-ws-reconnect-token-ui.md](./mobile-ws-reconnect-token-ui.md) — Reconexion WS al reanudar de suspenso mobile + mostrar tokens reales en UI
- [image-vision-and-generation.md](./image-vision-and-generation.md) — Soporte completo de vision de imagen (input multimodal) y generacion de imagen (output) para agentes
- [fast-decompose-tasks.md](./fast-decompose-tasks.md) — Optimizacion de decompose_tasks: reemplazar sesion secundaria + agent loop por llamada directa streamSimple()
- [workflows.md](./workflows.md) — Workflows: flujos deterministas multi-paso con agentes, definidos en lenguaje natural. Entidad nueva con motor de ejecucion DAG, NLP compiler, y UI visual con React Flow.
- [delegation-notification-ui.md](./delegation-notification-ui.md) — Renderizado limpio de resultados de delegacion con contrato compartido server/cliente via `details.type` en `packages/shared/`
## Completados (71)

Ver [COMPLETED/](./COMPLETED/)

