COMPLETED
# Plan: Quick fixes — Delegacion y visualizacion en canales (B1-B4)

**Severidad:** High
**Prioridad:** High (delegacion a canales rota, UX rota)
**Esfuerzo estimado:** 1-2 dias
**Riesgo:** Bajo (fixes puntuales, sin cambios de arquitectura)
**Area:** Canales / Delegacion

---

## B1: Delegacion a canal no se ejecuta correctamente

### Raiz

`delegate-tool.ts:167` para `targetType === "channel"`:

```typescript
// Linea 167
await channelOrchestrator.dispatchUserMessage(username, targetId, task, delegateSessionId);
// Linea 169 — lectura sincronica, el dispatch NO termino
const channelMessages = channelStore.getMessages(username, targetId, 100, delegateSessionId);
```

`dispatchUserMessage` (orchestrator.ts:176-178) en modo no-broadcast:

```typescript
this.runDispatchRound(username, channelId, userMsg, 1, controller.signal);
this.decrementChain(key);  // ← se decrementa ANTES de que los agentes terminen
```

`runDispatchRound` dispara agentes con `dispatchToAgentAsync` sin `await` (linea 211). El `chainPromise` (linea 161-163) inicia con `count: 1`. El `decrementChain` en linea 178 lo baja a 0 inmediatamente, resolviendo la promise **antes de que cualquier agente arranque**.

Ademas, no hay `forwardSubagentEvents()` para canales. El padre no recibe streaming.

### Fix

1. En `dispatchUserMessage`, modo no-broadcast: remover el `decrementChain` temprano. Que `dispatchToAgentAsync` se encargue del conteo (ya lo hace via `finally` en linea 228-230).
2. Agregar `forwardSubagentEvents()` para canales en `delegate-tool.ts`:

```typescript
// delegate-tool.ts, targetType === "channel"
const unsub = forwardSubagentEvents(
  /* como obtener la sesion del agente del canal? Ver AgentPromptRunner */
);
```

**Archivos:** `apps/server/src/core/tools/delegate-tool.ts`, `apps/server/src/channels/channel-orchestrator.ts`

---

## B2: Click en delegacion redirige fuera del canal

### Raiz

`DelegationsPanel.tsx:26-32` genera rutas que sacan al usuario del flujo del canal:

```typescript
navigate(`/channels/${channelId}/session/${subSessionId}`);
```

Esto monta un `ChatArea` independiente, perdiendo el contexto del canal.

### Fix

Modificar la navegacion para abrir un drawer/panel lateral que muestre la sub-sesion dentro del contexto del canal. Reutilizar `ChatArea` o `MessageList` en el drawer, apuntando al `sessionId` de la delegacion.

**Archivos:** `apps/client/src/components/chat/DelegationsPanel.tsx`, nuevo componente `DelegationDrawer.tsx`

---

## B3: Avatares de agentes no se muestran (solo SVG default)

### Raiz

`ChannelMessageList.tsx` no pobla `agentAvatarUrl` en los mensajes. El `ChannelMessage` del store no incluye `agentAvatarUrl`. `AgentAvatar.tsx:37` tiene `const token = ""` hardcodeado.

### Fix

1. Pasar `agentAvatarMap: Record<string, string>` desde `ChannelChatArea` a `ChannelMessageList`
2. Al renderizar mensajes de agente, buscar `agentAvatarUrl` en el mapa usando `msg.agentId`
3. `AgentAvatar` ya acepta `avatarUrl` como prop — verificar que funcione sin token de auth o ajustar la ruta

**Archivos:** `apps/client/src/components/channels/ChannelMessageList.tsx`, `apps/client/src/components/channels/ChannelChatArea.tsx`

---

## B4: Resultados de tools no visibles en canales

### Raiz

`ChannelMessages.tsx` (vista simple) no renderiza tool calls/results — solo muestra `msg.content` como `RichMarkdown`. El `ChannelMessage` del store incluye `toolCalls?: { toolName, args, result }[]` (runner.ts:388) pero no se renderizan.

`AgentPromptRunner` no forwardea `tool_execution_update` — solo `tool_execution_start` (linea 277) y `tool_execution_end` (linea 292).

### Fix

1. Agregar handler de `tool_execution_update` en `AgentPromptRunner.run()` (entre lineas 286 y 302):

```typescript
} else if (evt.type === "tool_execution_update" && channel.showTools) {
  this.broadcastFn(channelId, {
    type: "channel_agent_tool_update",
    channelId,
    sessionId: incomingMsg.sessionId,
    agentId: member.agentId,
    toolCallId: ev.toolCallId,
    toolName: ev.toolName,
    partialResult: ev.partialResult,
  });
}
```

2. Renderizar `toolCalls` en `ChannelMessages.tsx`: debajo del `RichMarkdown`, iterar `msg.toolCalls` y mostrar mini-cards con toolName, args resumidos, y resultado.

**Archivos:** `apps/server/src/channels/agent-prompt-runner.ts`, `apps/client/src/components/channels/ChannelMessages.tsx`

---

## Verificacion

1. Delegar a un canal con `@agent haz X` → el agente ejecuta, el resultado aparece
2. Click en tarjeta de delegacion → drawer lateral, sin perder el canal
3. Avatares de agentes visibles en lugar del SVG default
4. Tool calls visibles debajo de los mensajes de agente en el canal
5. `tool_execution_update` llega al WebSocket del canal

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `apps/server/src/core/tools/delegate-tool.ts` | Esperar dispatch + forwardSubagentEvents |
| `apps/server/src/channels/channel-orchestrator.ts` | Fix decrementChain temprano en no-broadcast |
| `apps/server/src/channels/agent-prompt-runner.ts` | +`tool_execution_update` forward |
| `apps/client/src/chat/DelegationsPanel.tsx` | Drawer en vez de navigate |
| `apps/client/src/channels/DelegationDrawer.tsx` | Nuevo: drawer con ChatArea/MessageList |
| `apps/client/src/channels/ChannelMessageList.tsx` | +agentAvatarUrl |
| `apps/client/src/channels/ChannelMessages.tsx` | Renderizar toolCalls |
