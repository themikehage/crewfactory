COMPLETED
# Tool Calling desde Custom Tools y Pipelines

## Problema

Actualmente las custom tools (modo pipeline) solo pueden llamar a 7 herramientas fijas (`bash`, `read`, `write`, `edit`, `grep`, `find`, `ls`). Los factory pipelines (script stages) ejecutan subprocesos bash sin acceso directo a las tools del sistema. No existe un mecanismo unificado para que cualquier tool invoque a otra tool.

## Arquitectura Actual (Descubierta)

### Custom Tools (Pipeline Engine)
- `PipelineEngine.executePipeline()` (`apps/server/src/core/custom-tools/pipeline-engine.ts:48-137`) itera steps y resuelve tools desde `session.allToolsMap.get(step.tool)` (line 77)
- **Restricción**: `PipelineStepSchema` (`schemas.ts:201`) limita el `tool` field a `z.enum(["bash", "read", "write", "edit", "grep", "find", "ls"])`
- El `allToolsMap` ya contiene **todas** las tools registradas en la sesión: system tools, custom tools, MCP tools (`mcp_*`), factory tools (`manage_factory`, `manage_custom_tools`, `manage_pipelines`), UI tools, delegate/spawn tools, memory tools
- El motor ya usa `tool.execute(toolCallId, resolvedParams, signal)` directamente (line 95)
- La inyección dinámica de tools existe via `manage_custom_tools` tool + `_refreshToolRegistry()`

### Factory Pipelines (PipelineRunner)
- **Script stages** (`pipeline-runner.ts:215-338`): spawn subproceso bash/powershell con env vars `TOKEN`/`JWT_TOKEN` + `STAGE_{ID}_OUTPUT` para outputs previos
- **Agent stages** (`pipeline-runner.ts:340-487`): crean `AgentSession` completa via `sessionManager.getOrCreateSession()`, tienen acceso a **todas** las tools agent registradas

### Vendor Agent Runtime
- `AgentTool` interface (`vendor/agent/src/types.ts`): `execute(toolCallId, params, signal?, onUpdate?) => Promise<AgentToolResult>`
- El `beforeToolCall` hook permite interceptar/deny llamadas (Permission Engine)
- Las tools custom se envuelven en `AgentTool` via `CustomToolRuntime` + `_refreshToolRegistry()`

## Opciones de Implementación

### Opción A: In-Process (llamadas directas entre tools)

**Cómo funciona:**
- Custom tools (modo pipeline) resuelven tools del `allToolsMap` de la sesión activa
- Se ejecutan en el mismo proceso, mismo contexto, mismo AbortSignal
- Ya implementado parcialmente en `pipeline-engine.ts`

**Pros:**
- Sin overhead de red (0ms latencia adicional)
- Acceso completo al contexto de sesión, workspace, auth
- Streaming en tiempo real via `onUpdate` funcionando
- AbortSignal propagation natural
- Implementación trivial (cambiar schema enum a string)
- Ya probado con las 7 tools actuales

**Contras:**
- Acoplado al lifecycle de la sesión (debe haber una sesión activa)
- No usable desde script stages (subprocesos bash)
- Potencial de dependencias circulares entre custom tools
- No usable desde fuera del sistema (webhooks, CI/CD, servicios externos)

### Opción B: REST API (tools expuestas via HTTP)

**Cómo funcionaría:**
- Endpoint tipo `POST /api/tools/:toolName/execute`
- Auth via middleware existente (cookie/token/bearer)
- Parámetros validados contra JSON Schema de la tool
- Resultados retornados como JSON

**Pros:**
- Desacoplado: usable desde scripts bash, CI/CD, webhooks
- Language-agnostic
- Cada tool call es independientemente autenticada
- Permite integraciones externas
- Único camino viable para script stages en factory pipelines

**Contras:**
- Overhead de red (serialización/deserialización JSON)
- Latencia adicional (~1-5ms requests HTTP)
- Streaming mucho más complejo (SSE o WS necesario)
- Necesita resolver contexto de sesión para cada tool (workspace, auth)
- No propaga AbortSignal naturalmente
- Más infraestructura (router, validación, rate limiting)
- Herramientas interactivas (request_approval, ask_question) no funcionan via HTTP

### Opción C: Híbrida (Recomendada)

**Fase 1 - In-Process para Custom Tools:**
- Expandir `PipelineStepSchema` para aceptar cualquier tool del registro
- Las custom tools pueden encadenar otras custom tools, factory tools, MCP tools, etc.

**Fase 2 - REST API para Factory Pipeline Script Stages:**
- Exponer endpoint `POST /api/tools/:toolName/execute`
- Script stages llaman via `curl -H "Authorization: Bearer $TOKEN"`

**Fase 3 - API completa para integración externa:**
- Streaming SSE
- Webhook triggers
- Rate limiting
- Documentación de API

## Análisis Detallado Fase 1

### Cambios necesarios (mínimos)

**1. `apps/server/src/core/custom-tools/schemas.ts`** (2 líneas):
```typescript
// Actual:
tool: z.enum(["bash", "read", "write", "edit", "grep", "find", "ls"]),
// Nuevo:
tool: z.string().min(1).max(64),
```

**2. `apps/server/src/core/custom-tools/pipeline-engine.ts`** (0 líneas):
- Ya resuelve tools dinámicamente de `allToolsMap` (line 77)
- Ya ejecuta `tool.execute(toolCallId, resolvedParams, signal)` (line 95)
- El `resolveVariables` ya funciona con cualquier parámetro
- No necesita cambios

**3. `apps/server/src/core/custom-tools/runtime.ts`** (0 líneas):
- El `onUpdate` callback ya funciona para pipeline steps
- Los resultados se resuelven correctamente

### Consideraciones adicionales

**Dependencias circulares**: Si `tool_a` llama `tool_b` que llama `tool_a`, el engine ejecutará secuencialmente. El onError `stop` cortará el loop si hay error. No hay deadlock porque la ejecución es secuencial (no recursiva). Pero el LLM podría generar loops infinitos en el diseño. **Mitigación**: el `signal` externo (abort del usuario) corta la ejecución.

**Scope de variables**: El `scope` se inicializa con `toolParams` y se extiende con cada `step.output`. Si tool_a llama tool_b, tool_b recibe los params resueltos. tool_b puede a su vez definir su propio output. Esto ya funciona porque `resolveVariables` resuelve recursivamente.

**Streaming**: Si una tool interna llama `onUpdate`, el `PipelineEngine` no lo re-expone actualmente (solo el paso completo se reporta via `onProgress`). **Mejora opcional**: suscribirse al `onUpdate` de la tool hija y re-forwardearlo.

## Análisis Detallado Fase 2

### Cambios necesarios

**1. Nuevo endpoint `POST /api/tools/execute`**:
```typescript
router.post("/tools/execute", authMiddleware, async (c) => {
  const username = getUsername(c);
  const { toolName, params, sessionId } = await c.req.json();
  
  // Resolver sesión
  const session = sessionManager.getSession(username, sessionId);
  if (!session) throw new Error("Session not found");
  
  // Buscar tool
  const tool = session.allToolsMap.get(toolName);
  if (!tool) throw new Error(`Tool ${toolName} not found`);
  
  // Ejecutar
  const toolCallId = `api_${randomUUID()}`;
  const result = await tool.execute(toolCallId, params, /* signal? */);
  
  return c.json(result);
});
```

**2. Script stages**: Ya tienen `TOKEN`/`JWT_TOKEN` env vars. Podrían llamar:
```bash
curl -s -X POST /api/tools/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"toolName":"bash","params":{"command":"npm run build"}}'
```

### Desafíos de Fase 2

1. **Contexto de sesión**: ¿Qué sesión usar? Una sesión genérica compartida vs crear una ad-hoc
2. **Streaming**: Tools como `bash` pueden ejecutarse por minutos. REST no streamea bien. Solución: endpoint devuelve `runId`, cliente consulta resultado vía polling, o usar SSE
3. **AbortSignal**: No hay señal de aborto desde HTTP request. Solución: `POST /api/tools/execute/abort/:runId`
4. **Tools interactivas**: `request_approval`, `ask_question` no tienen sentido vía REST (requieren WebSocket)

## Recomendación Final

| Aspecto | Fase 1 (In-Process) | Fase 2 (REST) | Fase 3 (API Completa) |
|---|---|---|---|
| Esfuerzo | ~2 líneas de código | ~50-100 líneas | ~200-400 líneas |
| Impacto | Custom tools pueden llamar ANY tool | Script stages acceden a tools | Integración externa |
| Riesgo | Muy bajo (ya funciona con 7 tools) | Medio (streaming, auth, ctx) | Medio-alto |
| Tiempo estimado | 10 min | 2-4 horas | 1-2 días |
| Dependencias | Ninguna | Session context resolution | Streaming infra |

**Conclusión**: Hacer Fase 1 inmediatamente (esfuerzo trivial, impacto enorme). Fase 2 cuando se necesite que script stages de pipelines usen tools no-bash. Fase 3 si hay demanda de integración externa.

### Technical Debt / Patrones a evitar

1. **No crear dependencias circulares en el schema**: No validar contra `string` podría permitir nombres inválidos. Usar `z.string().min(1).max(64).regex(/^[a-zA-Z0-9_]+$/)` para mantener consistencia.
2. **No perder el streaming**: Si una tool hija llama `onUpdate`, idealmente el pipeline engine debería re-forwardear esos updates. No crítico para Fase 1 pero buena práctica.
3. **No acoplar Fase 2 al engine de Fase 1**: La API REST debe ser independiente del `PipelineEngine`.
