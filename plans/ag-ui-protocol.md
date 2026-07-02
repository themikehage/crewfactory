# AG-UI Protocol — Interactive Agent Components

**Fecha:** 2026-07-02
**Revisión:** v1 — Protocolo AG-UI sobre eventos WebSocket existentes

## Problema

Los agentes solo pueden responder con texto plano o markdown. No hay forma de que un agente:
- Pida confirmación al usuario antes de ejecutar una acción destructiva (deploy, delete, bash)
- Renderice gráficos interactivos inline (barras, líneas, tablas)
- Muestre formularios dinámicos para recolectar input estructurado

CrewFactory tiene WebSocket streaming, tool calls, y un event broker — pero falta una capa de UI generativa agente→frontend.

## Stack objetivo

**Protocolo:** AG-UI (abierto, CopilotKit) — adaptado como eventos WS sobre nuestra infraestructura existente.

**Contextos:** Sesiones de chat, canales multi-agente, y agentes programáticos vía API.

**Componentes prioritarios:**
1. Formularios y aprobaciones (confirmar/cancelar acciones)
2. Gráficos y visualizaciones (charts inline con datos dinámicos)

## Arquitectura

```
Agente (Pi SDK)
  │
  ├─ text_delta, tool_call_start/end, message_end (eventos WS existentes)
  │
  └─ ui_component       ← NUEVO: definición de componente AG-UI
     └─ ui_action        ← NUEVO: respuesta del usuario al componente
```

### Flujo de aprobación

```
Usuario: "Deployá la app a producción"
  ↓
Agente analiza → emite ui_component (approval_request)
  ↓
Frontend renderiza: [⚠️ Deploy a producción?] [✅ Confirmar] [❌ Cancelar]
  ↓
Usuario hace clic en Confirmar
  ↓
Frontend emite ui_action (approval_response: "confirmed")
  ↓
Agente recibe → ejecuta deploy → responde con resultado
```

### Flujo de chart

```
Usuario: "Mostrame las métricas del último mes"
  ↓
Agente analiza → emite ui_component (chart)
  {
    type: "bar",
    title: "Ventas mensuales",
    data: [{ label: "Ene", value: 120 }, ...],
    config: { stacked: false }
  }
  ↓
Frontend renderiza gráfico con Recharts inline en el mensaje
```

## Eventos WebSocket

### `ui_component` (server → client)

```typescript
{
  type: "ui_component",
  sessionId: string,
  componentId: string,          // UUID único para este componente
  componentType: "approval" | "chart" | "form",
  props: Record<string, unknown>,
  blocking?: boolean,            // si true, el agente espera respuesta
  persist?: boolean              // si true, guardar en mensajes
}
```

### `ui_action` (client → server)

```typescript
{
  type: "ui_action",
  sessionId: string,
  componentId: string,
  action: string,                // "confirm" | "cancel" | value
  payload?: Record<string, unknown>
}
```

## Componentes

### ApprovalRequest

Props:
```typescript
{
  title: string,
  description: string,
  severity: "info" | "warning" | "critical",
  confirmLabel?: string,       // default "Confirmar"
  cancelLabel?: string,        // default "Cancelar"
  details?: string             // markdown con más contexto
}
```

Actions: `"confirmed"` | `"cancelled"`

### Chart

Props:
```typescript
{
  chartType: "bar" | "line" | "pie" | "area",
  title?: string,
  data: Array<{ label: string; value: number; [key: string]: unknown }>,
  config?: {
    stacked?: boolean,
    colors?: string[],
    xLabel?: string,
    yLabel?: string
  }
}
```

Actions: ninguna (render-only, no blocking)

## Archivos a modificar/crear

| Archivo | Cambio |
|---|---|
| `apps/server/src/pi/ui-protocol.ts` | **NUEVO** — tipos, validación Zod, serialización AG-UI |
| `apps/server/src/ws/handler.ts` | Manejar `ui_action` entrante, reenviar `ui_component` saliente |
| `apps/server/src/pi/session-manager.ts` | Pasar `ui_action` al agente como mensaje de sistema+usuario |
| `apps/client/src/hooks/useWebSocket.ts` | Tipar nuevos eventos `ui_component`, `ui_action` |
| `apps/client/src/components/chat/MessageList.tsx` | Detectar `componentId` en mensajes, renderizar inline |
| `apps/client/src/components/chat/UiComponent.tsx` | **NUEVO** — renderer de componentes AG-UI |
| `apps/client/src/components/chat/ApprovalForm.tsx` | **NUEVO** — botones confirmar/cancelar |
| `apps/client/src/components/chat/ChartView.tsx` | **NUEVO** — gráficos con Recharts |
| `apps/server/src/channels/channel-orchestrator.ts` | Reenviar `ui_component` en canales multi-agente |
| `apps/server/src/lib/event-broker.ts` | Loggear eventos UI en consola de monitoreo |

## Dependencias

- **Recharts** (client) — librería de gráficos para React. Agregar a `apps/client/package.json`.
- No requiere nuevas dependencias de backend (todo sobre WS existente).

## Lo que NO cambia

- Auth y JWT — los eventos WS ya están autenticados
- Sesiones y persistencia — los componentes AG-UI no se persisten (a menos que `persist: true`)
- Pipeline de tool calls — las aprobaciones son un nuevo tipo de evento, no un tool call
- Channels — el orchestrator reenvía `ui_component` como evento broadcast, no altera la lógica de dispatch
- Preview server, PWA, backup, integraciones — sin cambios

## Fases

### Fase 1: Core protocolo
- Definir tipos y esquemas Zod en `ui-protocol.ts`
- Implementar `ui_component` y `ui_action` en WS handler
- Crear `UiComponent.tsx` con routing básico por `componentType`
- Integrar en `MessageList.tsx`
- Validar compilación

### Fase 2: Approval Flow
- Implementar `ApprovalForm.tsx` con botones
- Wire `ui_action:confirmed/cancelled` → sesión del agente como mensaje de sistema
- Probar con agente que pide confirmación antes de bash/tool calls

### Fase 3: Charts
- Instalar Recharts
- Implementar `ChartView.tsx` con 4 tipos (bar, line, pie, area)
- Probar con agente que analiza datos y renderiza gráficos

### Fase 4: Canales multi-agente
- Reenviar eventos UI en `channel-orchestrator.ts`
- Manejar `componentId` único por canal para evitar colisiones
- Probar aprobación en canal con 2+ agentes

### Fase 5: Persistencia y polish
- Guardar componentes AG-UI con `persist: true` en `messages.jsonl`
- Cargar y renderizar componentes al reabrir sesión
- Logging en event broker

## Referencias

- [AG-UI Protocol (AWS Blog)](https://aws.amazon.com/blogs/machine-learning/build-generative-ui-for-ai-agents-on-amazon-bedrock-agentcore-with-the-ag-ui-protocol/)
- [CopilotKit](https://github.com/CopilotKit/CopilotKit)
- Nuestro sistema WS: `apps/server/src/ws/handler.ts`
