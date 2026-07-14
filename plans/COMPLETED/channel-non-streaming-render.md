COMPLETED
# Channel Non-Streaming Render

## Problem

Cuando multiples agentes responden simultaneamente en un canal (modo broadcast), cada agente que empieza a responder aparece inmediatamente como un mensaje parcial. Con cada `channel_agent_token` que llega, todos los mensajes se actualizan caracter-por-caracter al mismo tiempo. Esto crea un caos visual con scroll erratico.

El mensaje **completo** ya llega via `channel_message`. Los tokens de streaming son redundantes para la visualizacion.

## Root Cause

`ChannelMessageList.tsx` (lines 88-155) y `ChannelMessages.tsx` (lines 74-110) mapean `streamingAgents` a pseudo-mensajes visibles con `isStreaming: true`. MessageList renderiza estos con cursor parpadeante. Cuando 3+ agentes responden a la vez, el feed se vuelve ilegible.

## Solution

**Buffer approach**: Ocultar los mensajes parciales. Solo mostrar el mensaje completo cuando `channel_message` llega. Mostrar un indicador sutil de "escribiendo..." en posicion fija (no inline en el feed).

## Implementation Plan

### Phase 1: Simple Buffer (Core Fix)

**Step 1 — `ChannelMessageList.tsx`** (`apps/client/src/components/channels/ChannelMessageList.tsx`)
- Lineas 88-155: Eliminar o comentar el bloque que mapea `streamingAgents` a mensajes visibles
- Mantener lineas 20-85 (mapeo de mensajes completos) sin cambios
- El prop `streamingAgents` se sigue recibiendo pero ya no crea pseudo-mensajes
- Ya existe guardia de race condition (lines 88-94) que verifica si el contenido final ya esta en `messages` -- naturalmente compatible con este cambio

**Step 2 — `ChannelMessages.tsx`** (`apps/client/src/components/channels/ChannelMessages.tsx`)
- Lineas 74-110: Eliminar o comentar el bloque `activeStreamList.map(...)` que renderiza burbujas de streaming
- Este es el path de renderizado alternativo usado en `ChannelDetailPage`

**Step 3 — Typing indicator en `ChannelChatArea.tsx`** (`apps/client/src/components/channels/ChannelChatArea.tsx`)
- Insertar barra de indicador entre el header (linea 100-163) y la lista de mensajes (linea 167)
- Cuando `isStreaming` (ya calculado en linea 20), mostrar: `"Agent1, Agent2 responding..."` con dot animado
- La barra desaparece automaticamente cuando `channel_agent_end` limpia las entradas de `streamingAgents`
- Implementacion:
  ```
  {isStreaming && (
    <div className="px-4 py-1.5 bg-card/30 border-b border-border/30 flex items-center gap-2 text-xs text-muted-foreground">
      <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
      {Object.values(streamingAgents).map(a => a.agentName || a.agentId).join(", ")} responding...
    </div>
  )}
  ```

**Step 4 — Typing indicator en `ChannelMessages.tsx`**
- Agregar indicador similar compacto al inicio del area de mensajes

**Step 5 — `ChannelOrgPage` — mantener como esta**
- `OrgFlowCanvas` y `OrgFlowMobile` usan `streamingAgents` para mostrar estados y speech bubbles en nodos individuales
- Esto es aceptable mantener con streaming ya que muestra actividad individual de agentes, no un feed compartido

### Phase 2 (Optional): Per-Channel Toggle

**Step 6 — Schema** (`packages/shared/src/schemas.ts`)
- Agregar a `CreateChannelSchema` y `UpdateChannelSchema`:
  ```typescript
  streamingRenderMode: z.enum(["live", "complete"]).optional()
  ```

**Step 7 — Channel store** (`apps/server/src/channels/channel-store.ts`)
- Agregar `streamingRenderMode` al metodo `updateChannel`

**Step 8 — Settings modal** (`apps/client/src/components/channels/ChannelSettingsModal.tsx`)
- Agregar toggle junto a `showThinking` / `showTools`

**Step 9 — Conditional rendering** en `ChannelMessageList.tsx` y `ChannelMessages.tsx`
- Gate: solo renderizar streaming si `channel?.streamingRenderMode !== "complete"`

## Files to Modify

| File | Change |
|------|--------|
| `apps/client/src/components/channels/ChannelMessageList.tsx` | Remove streaming-to-message mapping block (lines 88-155) |
| `apps/client/src/components/channels/ChannelMessages.tsx` | Remove streaming bubble rendering block (lines 74-110) |
| `apps/client/src/components/channels/ChannelChatArea.tsx` | Add typing indicator bar |
| `packages/shared/src/schemas.ts` | Optional: add `streamingRenderMode` to channel schemas |
| `apps/server/src/channels/channel-store.ts` | Optional: handle `streamingRenderMode` in updateChannel |

## Key Observations

- `channel_message` ya transmite el mensaje completo -- no hay necesidad de acumular tokens en el frontend
- `streamingAgents` se sigue necesitando para: `isStreaming` (deshabilitar input), abort, indicador de typing, reconexion
- Dos paths de renderizado existen (ChannelMessageList + ChannelMessages) -- ambos deben actualizarse
- El `ChannelOrgPage` se mantiene con streaming ya que es visualizacion de estado individual de agentes
