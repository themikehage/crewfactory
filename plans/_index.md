# Plans — Future Feature Ideas

Cada archivo `.md` en esta carpeta documenta una funcionalidad propuesta para implementar más adelante.

## Cómo contribuir
- Crea un archivo con un nombre descriptivo en inglés o español (ej. `vscode-integration.md`)
- Usa el formato: descripción, motivación, enfoque técnico sugerido, dependencias
- Enlázalo aquí abajo cuando esté listo

## Índice

- [meta-agent-optimization-loop.md](./meta-agent-optimization-loop.md) — Ciclo de optimización continua: workspace agent crea agentes, observa ejecuciones, y propone mejoras en skills y quick actions.
- [one-click-deploy-and-landing.md](./one-click-deploy-and-landing.md) — Producción-grade Dockerfile + compose, templates one-click Coolify/Dokploy, landing page SEO, CI/CD a GHCR, guía de deploy para la comunidad.
- [agent-channel-gallery.md](./agent-channel-gallery.md) — Galería comunitaria de plantillas de agentes y canales, con instalación en 1 clic, exportación, y curación vía PRs.
- [channels-to-teams-with-orgchart.md](./channels-to-teams-with-orgchart.md) — Renombrar "Channels" a "Teams" en la UI, roles jerárquicos (lead, senior, member, observer), y vista de organigrama SVG alternativa.
- [sidebar-slack-experience.md](./sidebar-slack-experience.md) — Rediseñar navegación con acordeones de proyectos, agentes y canales en el sidebar y sesiones desplegables desde la derecha.
- [parallel-agent-dispatch.md](./parallel-agent-dispatch.md) — Ejecución paralela de agentes en channels mediante colas por agente + Promise.all, eliminando el cuello de botella secuencial.
- [qwen-cloud-provider.md](./qwen-cloud-provider.md) — Agregar Qwen Cloud (DashScope) como provider de LLMs via API compatible con OpenAI.
- [ag-ui-protocol.md](./ag-ui-protocol.md) — Protocolo AG-UI para componentes interactivos agente→frontend: aprobaciones, formularios y gráficos inline vía WebSocket.
- [chat-empty-state.md](./chat-empty-state.md) — Pantalla de bienvenida estilo ChatGPT con input centrado verticalmente cuando la sesion no tiene mensajes.
- [mcp-marketplace.md](./mcp-marketplace.md) — Marketplace de MCPs estilo Windsurf: galeria de servidores populares, MCPs custom, conexion y exposicion de tools al agente.
- [mcp-marketplace-implementation-plan.md](./mcp-marketplace-implementation-plan.md) — Plan detallado de implementación para el robusto MCP Marketplace & Gallery en CrewFactory, con soporte Stdio/HTTP.
- [engram-agent-memory.md](./engram-agent-memory.md) — Memoria persistente para agentes vía `@engram-ai-memory/core` con SQLite, embeddings ONNX locales, decay Ebbinghaus y knowledge graph.
- [env-var-obfuscation.md](./env-var-obfuscation.md) — Cifrado AES-256-GCM de env.json en reposo, filtrado de secrets en output bash, y API de revelado individual con auditoría.
- [gentle-ai-prompt-patterns.md](./gentle-ai-prompt-patterns.md) — Análisis de patrones de prompts y subdelegación de agentes extraídos de Gentle AI (SDD framework), con 12 patrones transferibles a CrewFactory y hoja de ruta de implementación.
- [hackathon-agent-society-roadmap.md](./hackathon-agent-society-roadmap.md) — Hoja de ruta Track 3 "Agent Society" (v2 — plataforma desacoplada): análisis competitivo, gaps frente a los 3 requisitos obligatorios, y 7 fases (channel schema extensions, negotiation protocol engine, efficiency benchmark framework, role-driven decomposition, MCP, meta-agent optimization loop, submission assets) que añaden capabilities config-driven al channel schema; AutoConsulting es el caso de uso demostrable, no lógica embebida.
- [laboratory-experiments.md](./laboratory-experiments.md) — Laboratory: sistema de experimentos multi-variante (single agent / multi sin lider / multi con lider) con generacion automatica de agentes con posturas enfrentadas via templates + IA, ejecucion paralela, live view en 3 columnas, y LLM-Judge automatico para evaluar y comparar resultados de negociacion entre agentes.
- [laboratory-ui-improvements.md](./laboratory-ui-improvements.md) — Mejoras de UX en el Laboratory: streaming SSE en wizard steps (analisis y briefings), selector de modelo default inteligente (conexion al agente global), refactor de LiveStreamColumn para reutilizar ChannelMessageList con auto-scroll y persistencia de mensajes, y tabs responsive para variantes.
- [laboratory-create-edit-lifecycle.md](./laboratory-create-edit-lifecycle.md) — Separar creacion de ejecucion en el Laboratory: wizard con modos create/edit, guardar sin ejecutar, boton Detener en dashboard, protecciones de estado (no editar/eliminar mientras corre), AbortController en ExperimentRunner.
- [channel-orgchart-redesign.md](./channel-orgchart-redesign.md) — Rediseño del organigrama de canales: refactor a componentes separados, canvas responsivo, animaciones con Framer Motion, tooltips en vez de overlay, unificación de colores con tokens Tailwind, y mejoras mobile/empty state.
- [benchmark-system-v2.md](./benchmark-system-v2.md) — Benchmark inline integrado al canal: toggle desde settings, ejecución paralela automática al enviar mensajes, pestaña live side-by-side (channel vs single-agent), historial acumulado de benchmarks + optimizaciones accesible desde tabs en el chat.
- [i18n-literals.md](./i18n-literals.md) — Sistema de traduccion con archivos `.literals.ts` por vista: LiteralsContext, useLiterals hook, soporte ES/EN, cobertura total de ~40 vistas y componentes.
- [ui-fixes-batch.md](./ui-fixes-batch.md) — Lote de correcciones UI: SessionPopover, delete icon, syntax highlighting, image modal, theme/language toggles, agent avatars, MCP dedup.
- [judge-management-ui.md](./judge-management-ui.md) — Judge Management UI: persistir scores por criterio del LLM-Judge, endpoint on-demand `POST /api/experiments/:id/judge`, vista comparativa como tab nuevo, desglose por criterio + reasoning en panel derecho, y feedback visual del estado de evaluación.
- [opencode-go-provider.md](./opencode-go-provider.md) — Registrar OpenCode Go como proveedor nativo de LLMs a través de su API OpenAI-compatible en el backend.

