# Channel Delegation & Negotiation v2

## Status: Draft

## Problem Statement

Los canales de CrewFactory tienen 5 bugs críticos y carecen de diferenciación semántica entre delegación (ejecutar y devolver) y negociación (proponer, debatir, responder). El sistema actual de turnos en paralelo causa que los agentes se interrumpan entre sí soltando fragmentos de texto entremezclados.

## Bugs Identificados

### B1: Delegación a canal no se ejecuta correctamente
- **Raíz**: `delegate-tool.ts:167` llama `dispatchUserMessage()` y luego `channelStore.getMessages()` sincrónicamente. En modo no-broadcast, `runDispatchRound` dispara agentes en paralelo pero el `chainPromise` se resuelve antes de que terminen (el decrement inicial en `dispatchUserMessage:178` + los increments async crean una race condition). Resultado: `lastText = ""`.
- **Raíz 2**: No hay `forwardSubagentEvents()` para canales. El padre no recibe streaming en tiempo real.

### B2: Click en delegación redirige fuera del canal
- **Raíz**: `DelegationsPanel.tsx:26-32` genera rutas `/channels/{id}/session/{subSessionId}`. El usuario sale del flujo del canal al hacer clic.
- **Fix**: Mantener al usuario en el canal pero abrir un drawer/panel lateral con la vista de la sub-sesión, o renderizar la delegación como tarjeta expandible inline.

### B3: Avatares de agentes no se muestran (solo SVG por defecto)
- **Raíz**: `ChannelMessageList.tsx` no puebla `agentAvatarUrl` en los mensajes mapeados. `MessageList.tsx:213` depende de `firstAssistant?.agentAvatarUrl || activeAgentAvatarUrl`, ambos undefined en contexto de canal.
- **Raíz 2**: `AgentAvatar.tsx:37` tiene `const token = ""` — token de auth deshabilitado.

### B4: Resultados de tools no visibles en canales
- **Raíz**: `ChannelMessages.tsx` (vista simple) no renderiza tool calls/results.
- **Raíz**: `AgentPromptRunner` no reenvía `tool_execution_update` al canal (solo `start/end`).
- **Raíz**: `ToolCallRow` para `delegate_task` solo muestra barra mínima sin resultado inline.

### B5: Agentes se interrumpen entre sí (streaming entremezclado)
- **Raíz**: `runDispatchRound` dispara todos los agentes en paralelo. El streaming de múltiples agentes llega al WebSocket simultáneamente.
- **Impacto**: En `streamingRenderMode: "live"`, los tokens de varios agentes se mezclan en `activeStreamList`, causando renders caóticos de texto parcial.

## Diseño Propuesto: Pipeline de Delegación y Negociación

### Concepto Central: Execution IDs y Task Registry

Cada acción dentro de un canal (delegación o negociación) recibe un `executionId` único que permite:
1. Tracking del progreso en tiempo real
2. Consulta posterior del resultado
3. Visualización de lo que está haciendo el agente en cada momento
4. Diferenciar delegación (fire-and-wait) de negociación (fire-and-debate)

### Nuevos Tipos de Mensaje de Canal

```typescript
// Mensaje de inicio de ejecución (reemplaza el texto suelto del agente)
interface ChannelTaskStart {
  type: "channel_task_start";
  executionId: string;
  agentId: string;
  agentName: string;
  taskType: "delegation" | "negotiation";
  description: string;       // "Voy a analizar el archivo X"
  parentExecutionId?: string; // Para tareas anidadas
  timestamp: number;
}

// Progreso de ejecución (tool calls, pasos)
interface ChannelTaskProgress {
  type: "channel_task_progress";
  executionId: string;
  step: string;
  toolCall?: { name: string; arguments: any };
  toolResult?: { content: any; isError: boolean };
}

// Resultado final de ejecución
interface ChannelTaskEnd {
  type: "channel_task_end";
  executionId: string;
  status: "completed" | "failed" | "blocked";
  result: string;            // Texto final o resumen
  envelope?: DelegationEnvelope;  // Estructura status/executive_summary/artifacts/risks
}
```

### Diferenciación Delegación vs Negociación

| Aspecto | Delegación | Negociación |
|---------|-----------|-------------|
| **Trigger** | `@agent haz X` | `@agent qué opinas de Y` |
| **Flujo** | Agente ejecuta → devuelve resultado → líder continúa | Agente responde → líder debate → puede haber varias rondas |
| **Bloqueo** | No bloquea el hilo principal (se puede seguir hablando) | Bloquea hasta llegar a acuerdo o maxRounds |
| **Visualización** | Barra de progreso + resultado al terminar | Burbujas de chat normales con indicador de debate |
| **Ejecución** | El líder puede lanzar varias delegaciones en paralelo | Secuencial por naturaleza |
| **ExecutionId** | Se asigna uno, se puede consultar estado | Cada ronda tiene su ID de negociación |

### Líder: Toma de Decisiones

El system prompt del líder (`role-leader.ts`) debe modificarse para incluir reglas explícitas:

```
DECISION RULES:
- DELEGATE when: task is well-defined, has clear deliverable, can run independently, 
  no debate needed (e.g., "analyze this file", "refactor X", "run tests")
- NEGOTIATE when: task requires consensus, has multiple valid approaches, needs 
  peer review, involves architectural decisions (e.g., "which library to use", 
  "how to structure the API")
- Use @agent task_description format for both
- For delegation: the agent will work independently and return results
- For negotiation: expect back-and-forth discussion until agreement
```

### UI de Delegación Rediseñada

```
┌─────────────────────────────────────────────────────────────┐
│ @backend-dev Refactorizar el módulo de autenticación         │
│                                                              │
│ ████████████░░░░░░░░ 60% - Ejecutando tests                  │
│                                                              │
│ [Ver progreso en vivo]  [Cancelar]                           │
└─────────────────────────────────────────────────────────────┘
```

- **@nombre** del agente asignado
- **Descripción** de la tarea delegada
- **Barra de progreso** basada en pasos/tools ejecutadas
- **Botón "Ver"** que expande un drawer con el log en vivo de la sub-sesión SIN salir del canal
- El drawer usa `ChannelMessageList` con los mensajes de la sub-sesión, permitiendo ver tool calls, resultados, etc.

### Pipeline de Ejecución (Estilo CI/CD)

Cada ejecución (delegación) se modela como un pipeline linear:

```
executionId: "exec_abc123"
├── Step 1: read auth.ts (completado, 0.3s)
├── Step 2: bash "grep -r 'deprecated'" (completado, 1.2s)
├── Step 3: edit auth.ts (en progreso...)
├── Step 4: write tests/auth.test.ts (pendiente)
└── Step 5: bash "bun test" (pendiente)
```

Esto permite:
- Ver exactamente qué está haciendo el agente
- Estimar tiempo restante
- Cancelar pasos individuales o toda la ejecución
- Consultar el estado de cualquier executionId posteriormente

### API de Consulta de Ejecuciones

```
GET /api/channels/:id/executions/:executionId
→ { executionId, agentId, taskType, status, steps: Step[], startedAt, completedAt? }

GET /api/channels/:id/executions
→ Execution[] (todas las ejecuciones del canal, paginadas)

WS: channel_task_start / channel_task_progress / channel_task_end
```

## Fases de Implementación

### Phase A: Arreglar Bugs Críticos (1-2 días)

#### A1: Fix delegación a canal (B1)
- **Archivo**: `apps/server/src/core/tools/delegate-tool.ts`
- Hacer que `dispatchUserMessage` espere correctamente la resolución del chain
- Agregar `forwardSubagentEvents` para canales (similar a sesiones)
- **Verificación**: Delegar a un canal con `@agent haz X` debe ejecutar y devolver resultado

#### A2: Fix avatares en canales (B3)
- **Archivos**: `apps/client/src/components/channels/ChannelMessageList.tsx`, `apps/client/src/components/shared/AgentAvatar.tsx`
- Construir y pasar `agentAvatarMap` a `ChannelMessageList`
- Poblar `agentAvatarUrl` en los mensajes mapeados
- Restaurar el token de auth en `AgentAvatar` (o verificar que la ruta esté antes del middleware)
- **Verificación**: Los agentes en canales deben mostrar su imagen de perfil registrada, no SVG por defecto

#### A3: Fix resultados de tools en canales (B4)
- **Archivos**: `apps/client/src/components/channels/ChannelMessages.tsx`, `apps/server/src/channels/agent-prompt-runner.ts`
- Agregar renderizado de tool calls/results en `ChannelMessages` (vista simple)
- Reenviar `tool_execution_update` desde `AgentPromptRunner` al WebSocket del canal
- Mejorar `ToolCallRow` para `delegate_task` mostrando resultado inline
- **Verificación**: Al ejecutar un canal, los tool calls deben ser visibles

#### A4: Fix redirección de delegación (B2)
- **Archivo**: `apps/client/src/components/chat/DelegationsPanel.tsx`
- Cambiar navegación para abrir drawer lateral inline en vez de salir del canal
- Implementar `DelegationDrawer` que muestre la sub-sesión dentro del contexto del canal
- **Verificación**: Click en delegación abre panel lateral sin perder el contexto del canal

### Phase B: Sistema de Execution IDs (2-3 días)

#### B1: ChannelTaskRegistry (server)
- **Archivo**: `apps/server/src/channels/channel-task-registry.ts`
- CRUD de ejecuciones: `createExecution()`, `updateStep()`, `completeExecution()`
- Persistencia en `channels/{id}/executions/{executionId}.json`
- WebSocket broadcasts: `channel_task_start`, `channel_task_progress`, `channel_task_end`
- **Verificación**: Tests unitarios del registry

#### B2: Integrar en AgentPromptRunner
- **Archivo**: `apps/server/src/channels/agent-prompt-runner.ts`
- Al iniciar un agente, crear `channel_task_start` con executionId
- En cada tool execution start/end, emitir `channel_task_progress`
- Al finalizar, emitir `channel_task_end` con resultado
- **Verificación**: Al correr un canal, deben emitirse eventos de task por WebSocket

#### B3: API REST de ejecuciones
- **Archivo**: `apps/server/src/routes/channels.ts`
- `GET /api/channels/:id/executions` - listar ejecuciones del canal
- `GET /api/channels/:id/executions/:executionId` - detalle de una ejecución
- `GET /api/channels/:id/executions/:executionId/messages` - mensajes de la sub-sesión
- **Verificación**: curl a los endpoints

### Phase C: Diferenciación Delegar vs Negociar (2-3 días)

#### C1: Detección de intención en mensajes
- **Archivo**: `apps/server/src/channels/channel-orchestrator.ts`
- El líder usa keywords/formato para indicar tipo:
  - `DELEGATE: @agent tarea` → delegación
  - `NEGOTIATE: @agent propuesta` → negociación
- El sistema también puede detectar basado en el contenido (pregunta → negociar, orden → delegar)
- Almacenar `taskType` en el `ChannelMessage` y propagarlo

#### C2: Prompt del líder actualizado
- **Archivo**: `apps/server/src/core/prompts/fragments/role-leader.ts`
- Agregar reglas de decisión (DELEGATE vs NEGOTIATE)
- Instrucciones de formato para cada tipo
- Ejemplos de uso correcto

#### C3: Comportamiento diferenciado en el orchestrator
- **Archivo**: `apps/server/src/channels/channel-orchestrator.ts`
- **Delegación**: Despachar al agente, NO esperar respuesta para continuar el hilo. El líder puede seguir hablando. Cuando la delegación termina, se notifica con `channel_task_end`.
- **Negociación**: Comportamiento actual (esperar respuesta, debate, protocolo de acuerdo). El hilo se bloquea hasta resolver.
- **Verificación**: Test multi-agente con delegación en paralelo y negociación secuencial

### Phase D: UI de Delegación Rediseñada (2-3 días)

#### D1: Componente DelegationTaskCard
- **Archivo**: `apps/client/src/components/channels/DelegationTaskCard.tsx`
- Tarjeta con: @agent_name, descripción, barra de progreso, botón "Ver"
- Estados: pending → running → completed/failed
- Animaciones con Framer Motion
- **Verificación**: Renderizado en Storybook o manual

#### D2: Componente DelegationDrawer
- **Archivo**: `apps/client/src/components/channels/DelegationDrawer.tsx`
- Panel lateral/overlay que muestra la sub-sesión de la delegación
- Usa `ChannelMessageList` internamente para renderizar tool calls, resultados
- Botón de cerrar para volver al canal
- **Verificación**: Navegación fluida sin pérdida de contexto

#### D3: Integrar en ChannelMessages y ChannelMessageList
- Reemplazar renderizado actual de `delegate_task` con `DelegationTaskCard`
- Conectar eventos `channel_task_*` del WebSocket para actualizar progreso
- El botón "Ver" abre `DelegationDrawer` con los mensajes de la ejecución
- **Verificación**: E2E: enviar delegación → ver progreso → ver resultado → volver al canal

### Phase E: Negociación Visual Mejorada (1-2 días)

#### E1: Indicadores visuales de negociación
- Burbujas de chat con badge "Negotiating" para mensajes de negociación
- Indicador de ronda actual ("Round 2/5")
- Badge de estado: "Proposing" / "Counter-proposing" / "Agreed" / "Rejected"

#### E2: Panel de arbitraje
- Cuando se escala a árbitro, mostrar decisión con formato destacado
- Mostrar reasoning del árbitro en tarjeta expandible

### Phase F: Modo Secuencial por Defecto (1 día)

#### F1: Cambiar default a secuencial con broadcast
- Actualmente el default es paralelo (sin broadcast members)
- Cambiar para que canales nuevos tengan al menos el líder con `replyMode: "broadcast"`
- Esto fuerza el modo secuencial que evita el entremezclado de tokens (B5)
- Mantener modo paralelo como opción explícita para canales que lo necesiten

## Riesgos y Consideraciones

1. **Compatibilidad hacia atrás**: Los cambios en el formato de mensajes de canal deben ser aditivos. Canales existentes deben seguir funcionando.
2. **Rendimiento**: El task registry añade I/O de disco. Implementar con caché en memoria para canales activos.
3. **Complejidad del líder**: El prompt del líder debe ser claro pero no excesivamente largo para no consumir tokens.
4. **Paralelismo real**: Las delegaciones en paralelo requieren manejo cuidadoso de sesiones hijas y abort signals.
5. **Mobile**: El DelegationDrawer debe funcionar como bottom sheet en móvil, no como panel lateral.

## Entregables

1. Bugs B1-B5 resueltos y verificados
2. Sistema de Execution IDs con API REST + WebSocket
3. Prompt del líder con reglas DELEGATE vs NEGOTIATE
4. Componente DelegationTaskCard con progreso en vivo
5. DelegationDrawer para ver sub-sesiones sin salir del canal
6. Visualización mejorada de negociación (rondas, badges, arbitraje)
7. Modo secuencial por defecto para nuevos canales
8. Tests unitarios para ChannelTaskRegistry
9. Documentación actualizada en about.md
