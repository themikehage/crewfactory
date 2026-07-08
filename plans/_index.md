# Plans

Cada archivo `.md` en esta carpeta documenta una funcionalidad propuesta para implementar más adelante.
Los planes completados se mueven a [`COMPLETED/`](./COMPLETED/).

## Pendientes

- [data-persistence-migration.md](./data-persistence-migration.md) — Migracion a persistencia robusta con Docker Compose: paths configurables via env vars, entrypoint con inicializacion, volumenes nombrados en /app/data, y migracion automatica de datos legacy.
- [multi-agent-primitives-refactor.md](./multi-agent-primitives-refactor.md) — Refactorizacion a 4 primitivas componibles (spawn, delegate, negotiate, arbitrate). Consolida 7+ flujos multi-agente, elimina duplicacion, extrae protocolos reutilizables.
- [laboratory-agent-experience.md](./laboratory-agent-experience.md) — Laboratorio como sesion de chat con agente + tool `create_experiment`. Iteracion conversacional sobre experimentos, formulario editable convertido en tab de visualizacion, y eliminacion de IaGenerator (800 lineas).
- [agent-channel-gallery.md](./agent-channel-gallery.md) — Galería comunitaria de plantillas de agentes y canales, con instalación en 1 clic, exportación, y curación vía PRs.
- [agent-manager-tool.md](./agent-manager-tool.md) — Tool agent_manager para delegar tareas a agentes programáticos persistentes y supervisar su ejecución en tiempo real.
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
- [tool-visualization-exa-memory.md](./tool-visualization-exa-memory.md) — Rendering estructurado para tools `exa_search` y `engram_store/recall/forget`: iconos, resumen de args/resultado, componentes dedicados con cards para resultados de búsqueda y memorias.


## Completados (25)

Ver [COMPLETED/](./COMPLETED/)

