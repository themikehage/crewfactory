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
- [engram-agent-memory.md](./engram-agent-memory.md) — Memoria persistente para agentes vía `@engram-ai-memory/core` con SQLite, embeddings ONNX locales, decay Ebbinghaus y knowledge graph.
- [env-var-obfuscation.md](./env-var-obfuscation.md) — Cifrado AES-256-GCM de env.json en reposo, filtrado de secrets en output bash, y API de revelado individual con auditoría.
- [gentle-ai-prompt-patterns.md](./gentle-ai-prompt-patterns.md) — Análisis de patrones de prompts y subdelegación de agentes extraídos de Gentle AI (SDD framework), con 12 patrones transferibles a CrewFactory y hoja de ruta de implementación.
- [hackathon-agent-society-roadmap.md](./hackathon-agent-society-roadmap.md) — Hoja de ruta Track 3 "Agent Society" (v2 — plataforma desacoplada): análisis competitivo, gaps frente a los 3 requisitos obligatorios, y 7 fases (channel schema extensions, negotiation protocol engine, efficiency benchmark framework, role-driven decomposition, MCP, meta-agent optimization loop, submission assets) que añaden capabilities config-driven al channel schema; AutoConsulting es el caso de uso demostrable, no lógica embebida.
