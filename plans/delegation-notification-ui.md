# Delegation Notification UI

Mejorar el renderizado de los resultados de delegacion en el chat, manteniendo `role: "user"` pero con una UI limpia y un contrato compartido entre server y cliente para la deteccion.

---

## Contexto

Actualmente `formatDelegationResultMessage()` en `apps/server/src/core/agent-utils.ts:133-168` genera un mensaje con:

```typescript
{
  role: "user",
  content: [{ type: "text", text: `[SYSTEM NOTIFICATION: DELEGATION COMPLETED]\n...` }],
  timestamp: Date.now(),
}
```

Esto se renderiza como un `UserBubble` (alineado a la derecha, estilo mensaje de usuario) mostrando texto raw con formato tecnico (`[NOTIFICATION]`, `---`, `status:`, etc.).

**Problema del plan anterior** (`plans/COMPLETED/fix-delegation.md`, C1): proponia cambiar a `role: "toolResult"`, pero eso no es viable porque el `toolCallId` ya fue resuelto (el LLM ya recibio el resultado de la tool call original).

## Solucion: Shared marker + metadata + renderizado especial

### Principio de deteccion

En vez de pattern matching sobre texto (fragil), se usa un **contrato tipado** entre server y cliente:

1. Se define una constante `DELEGATION_NOTIFICATION_TYPE` en `packages/shared/`
2. El server la usa como valor de `details.type` en el mensaje
3. El cliente checkea `msg.details?.type === DELEGATION_NOTIFICATION_TYPE` para decidir el renderizado

Si en el futuro cambia el formato, se cambia la constante en un solo lugar y ambos lados se actualizan al unísono. Sin falsos positivos (ningun otro mensaje tiene ese `details.type`) ni falsos negativos (siempre se setea cuando corresponde).

---

## Archivos a modificar

### 1. `packages/shared/src/envelope.ts` — Shared contract

Agregar:
- Constante `DELEGATION_NOTIFICATION_TYPE = "delegation_notification"` — el marker unico
- Interfaz `DelegationNotificationDetails` con los campos del envelope

```typescript
export const DELEGATION_NOTIFICATION_TYPE = "delegation_notification";

export interface DelegationNotificationDetails {
  type: typeof DELEGATION_NOTIFICATION_TYPE;
  status: EnvelopeResult["status"];
  toolName: string;
  toolCallId: string;
  subagentSessionId: string;
  executiveSummary: string;
  artifacts: string;
  hasOutputText: boolean;
}
```

Esto es el **contrato compartido**: el server produce estos datos, el cliente los consume.

### 2. `apps/server/src/core/agent-utils.ts` — Server message builder

Modificar `formatDelegationResultMessage()` para:
- Usar `DELEGATION_NOTIFICATION_TYPE` en `details.type`
- Incluir `details` con toda la metadata estructurada
- Limpiar el texto a un formato mas legible

```typescript
import { DELEGATION_NOTIFICATION_TYPE } from "shared";
import type { DelegationNotificationDetails } from "shared";

export function formatDelegationResultMessage(
  toolCallId: string,
  toolName: string,
  envelope: EnvelopeResult,
  subagentSessionId: string,
  outputText?: string
): any {
  const details: DelegationNotificationDetails = {
    type: DELEGATION_NOTIFICATION_TYPE,
    status: envelope.status,
    toolName,
    toolCallId,
    subagentSessionId,
    executiveSummary: envelope.executive_summary,
    artifacts: envelope.artifacts,
    hasOutputText: !!(outputText && outputText.trim()),
  };

  // Texto limpio para la UI
  const statusLabel = envelope.status === "success" ? "Completed" : envelope.status;
  const summary = envelope.executive_summary.slice(0, 300);
  const parts = [
    `[Delegation ${statusLabel}]`,
    summary,
  ];
  if (envelope.artifacts && envelope.artifacts !== "none") {
    parts.push(`Artifacts: ${envelope.artifacts}`);
  }
  const text = parts.join("\n\n");

  return {
    role: "user",
    content: [{ type: "text", text }],
    details,
    timestamp: Date.now(),
  };
}
```

### 3. `apps/client/src/components/chat/MessageList.tsx` — Frontend rendering

Dos cambios:

**a) En `UserBubble` o en el grupo `user`**, detectar delegaciones y renderizar como notificacion centrada:

```tsx
import { DELEGATION_NOTIFICATION_TYPE } from "shared";

// En el render de MessageList, dentro del group.type === "user":
const isDelegation = group.msg.details?.type === DELEGATION_NOTIFICATION_TYPE;

if (group.type === "user" && !isDelegation) {
  <UserBubble ... />
} else if (group.type === "user" && isDelegation) {
  <DelegationNotification msg={group.msg} />
} else if (group.type === "system") {
  ...
}
```

**b) Componente `DelegationNotification`**:

```tsx
function DelegationNotification({ msg }: { msg: Message }) {
  const d = msg.details as any;
  if (!d) return null;

  const statusColors: Record<string, string> = {
    success: "bg-green-500/10 border-green-500/20 text-green-400",
    error: "bg-red-500/10 border-red-500/20 text-red-400",
    blocked: "bg-yellow-500/10 border-yellow-500/20 text-yellow-400",
    partial: "bg-yellow-500/10 border-yellow-500/20 text-yellow-400",
  };
  const dotColors: Record<string, string> = {
    success: "bg-green-500",
    error: "bg-red-500",
    blocked: "bg-yellow-500",
    partial: "bg-yellow-500",
  };
  const statusColor = statusColors[d.status] || "bg-accent/10 border-accent/20 text-accent";
  const dotColor = dotColors[d.status] || "bg-accent";

  const text = typeof msg.content === "string"
    ? msg.content
    : Array.isArray(msg.content)
    ? msg.content.map((b: any) => b.text || "").join(" ")
    : "";

  const [firstLine, ...rest] = text.split("\n");

  return (
    <div className="flex justify-center my-2 w-full">
      <div className="bg-surface/30 border border-border/40 text-text-secondary text-xs rounded-lg px-4 py-3 max-w-[85%] shadow-xs flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dotColor}`} />
          <span className={`text-[10px] font-mono uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded border ${statusColor}`}>
            {d.status}
          </span>
          <span className="font-medium text-text-primary text-xs">{firstLine.replace(/^\[.*?\]\s*/, "")}</span>
        </div>
        {rest.length > 0 && rest.some(l => l.trim()) && (
          <div className="text-[11px] text-text-secondary leading-relaxed pl-4">
            {rest.join("\n")}
          </div>
        )}
      </div>
    </div>
  );
}
```

### 4. Opcional: `packages/shared/src/index.ts`

Exportar los nuevos simbolos.

---

## Resumen del contrato compartido

| Capa | Que produce/consume | Donde |
|------|-------------------|-------|
| `packages/shared/` | Define `DELEGATION_NOTIFICATION_TYPE` y `DelegationNotificationDetails` | `envelope.ts` |
| Server (`agent-utils.ts`) | Setea `details.type = DELEGATION_NOTIFICATION_TYPE` y `details.status` | `formatDelegationResultMessage()` |
| Cliente (`MessageList.tsx`) | Checkea `msg.details?.type === DELEGATION_NOTIFICATION_TYPE` | `DelegationNotification` component |

Si alguien cambia el formato del texto en el server, el contrato `details.type` sigue intacto y la deteccion no se rompe. Si se cambia el marker, se cambia en `packages/shared/` y TS se asegura de que ambos lados esten sincronizados.

---

## Orden de implementacion

1. `packages/shared/src/envelope.ts` — Agregar `DELEGATION_NOTIFICATION_TYPE` y `DelegationNotificationDetails`
2. `apps/server/src/core/agent-utils.ts` — Modificar `formatDelegationResultMessage()` para usar el shared contract
3. `apps/client/src/components/chat/MessageList.tsx` — Agregar `DelegationNotification` component y deteccion
4. Verificar build y typecheck en server y cliente
