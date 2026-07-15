# Plan 5: Sistema `extend()` — Contexto Incremental a Subagentes en Ejecución

**Severidad:** Media  
**Prioridad:** Media (mejora funcional, no bloqueante)  
**Esfuerzo estimado:** 5-8 días  
**Riesgo:** Medio (cambia el modelo de comunicación padre-subagente)  
**Área:** Funcionalidad / Subagentes

---

## Resumen

Actualmente, la app de producción usa un modelo **fire-and-forget** para subagentes: el padre envía toda la información en el `task` inicial y no puede añadir más contexto durante la ejecución. Si el subagente descubre que necesita información adicional (un archivo que no se mencionó, una aclaración sobre los requisitos, una dependencia no documentada), no tiene forma de solicitarla al padre, y el padre no tiene forma de proporcionársela.

La funcionalidad `extend()` permite al padre **añadir contexto incremental** a un subagente que ya está en ejecución, sin necesidad de cancelarlo y crear uno nuevo. El contexto adicional se encola y el subagente lo procesa en su siguiente iteración del bucle de razonamiento.

---

## Análisis del Problema

### Modelo Actual — Sin Comunicación Bidireccional

```
Padre                                    Subagente
  │                                         │
  │──spawn_subagent(task="Arregla el bug")──▶│
  │                                         │ Inicia ejecución
  │                                         │ (contexto fijo, sin
  │  ❌ No puede enviar más contexto         │  capacidad de recibir
  │     durante la ejecución                │  más instrucciones)
  │                                         │
  │                                         │ Termina
  │◀──resultado (asíncrono)─────────────────│
```

### Cuándo se Necesita `extend()`

1. **Descubrimiento tardío**: El padre se da cuenta de que olvidó mencionar un archivo relevante.
2. **Branching condicional**: El resultado de otro subagente paralelo revela información que el subagente actual necesita.
3. **Corrección de rumbo**: El subagente va por un camino equivocado y el padre quiere redirigirlo sin cancelarlo (el trabajo parcial hecho puede ser útil).
4. **Instrucciones en fases**: El padre quiere dar instrucciones por fases: "primero analiza, luego te digo qué arreglar".

---

## Solución Propuesta

### Fase 1: API de Extensión en AgentSession

**Archivo:** `apps/server/src/ai/agent-session.ts`

Añadir un nuevo método `extend()` que permita inyectar mensajes en la cola del agente:

```typescript
export class AgentSession {
  // ... existente ...

  /** Cola de mensajes de extensión (contexto incremental del padre) */
  private extensionQueue: Array<{
    message: AgentMessage;
    resolve: () => void;
    reject: (err: Error) => void;
  }> = [];

  /** ¿Hay extensiones pendientes? */
  get hasPendingExtensions(): boolean {
    return this.extensionQueue.length > 0;
  }

  /**
   * Añade contexto incremental a un subagente en ejecución.
   * El mensaje se procesa en la siguiente iteración del bucle interno,
   * entre el turno actual del asistente y el siguiente.
   *
   * @returns Promise que se resuelve cuando el mensaje ha sido inyectado en el bucle
   */
  async extend(messageText: string): Promise<void> {
    if (!this.isStreaming && !this.activeRun) {
      // El subagente terminó — demasiado tarde para extender
      throw new Error("Cannot extend: subagent has already completed");
    }

    return new Promise((resolve, reject) => {
      this.extensionQueue.push({
        message: {
          role: "user",
          content: [
            {
              type: "text",
              text: `[CONTEXTO ADICIONAL DEL PADRE]: ${messageText}`,
            },
          ],
        },
        resolve,
        reject,
      });
    });
  }

  /**
   * Drena un mensaje de la cola de extensión y lo inyecta en el bucle.
   * Llamado por el AgentLoop entre turnos.
   */
  drainNextExtension(): AgentMessage | undefined {
    const entry = this.extensionQueue.shift();
    if (!entry) return undefined;
    entry.resolve(); // Notificar al padre que el mensaje fue recibido
    return entry.message;
  }
}
```

### Fase 2: Integración en el AgentLoop

**Archivo:** `apps/server/src/ai/vendor/agent/src/agent-loop.ts`

Modificar el bucle principal para drenar extensiones entre turnos:

```typescript
async function agentLoop(session: AgentSession, config: LoopConfig): Promise<void> {
  while (session.isStreaming) {
    // 1. Drenar extensiones del padre antes de cada turno del LLM
    const extension = session.drainNextExtension();
    if (extension) {
      // Inyectar como mensaje user en la conversación
      const formattedMessages = await session.sessionManager.appendMessage(extension);
      config.messages = formattedMessages;
      // Emitir evento para el frontend
      session.emit({
        type: "extension_received",
        content: extension.content?.[0]?.text ?? "",
      });
    }

    // 2. Drenar steering messages (existente)
    const steeringMessages = await config.getSteeringMessages?.() ?? [];
    // ...

    // 3. Turno del LLM (existente)
    // ...
  }
}
```

### Fase 3: API en spawn_subagent Tool

**Archivo:** `apps/server/src/core/tools/spawn-subagent-tool.ts`

Registrar el subagente en el `DelegationRegistry` con un método `extend`:

```typescript
// En la tool spawn_subagent, después de crear el subagente:
delegationRegistry.register(username, parentSessionId, toolCallId, {
  subagentSessionId,
  abort: () => subSession.abort(),
  extend: async (message: string) => {
    await subSession.extend(message);
  },
  // ... resto de metadata
});
```

### Fase 4: Nueva Tool `extend_subagent` para el Agente Padre

**Archivo nuevo:** `apps/server/src/core/tools/extend-subagent-tool.ts`

Crear una tool que el agente padre pueda invocar para enviar contexto adicional:

```typescript
export function createExtendSubagentTool(
  delegationRegistry: DelegationRegistry,
) {
  return {
    name: "extend_subagent",
    description: "Añade contexto adicional a un subagente que está en ejecución. " +
      "Usa esto cuando descubras información relevante después de haber spawneado el subagente.",
    parameters: {
      type: "object",
      properties: {
        tool_call_id: {
          type: "string",
          description: "El tool_call_id del spawn_subagent original al que quieres añadir contexto",
        },
        message: {
          type: "string",
          description: "El contexto adicional o instrucciones a enviar al subagente",
        },
      },
      required: ["tool_call_id", "message"],
    },
    execute: async (toolCallId: string, params: { tool_call_id: string; message: string }) => {
      const delegation = delegationRegistry.get(params.tool_call_id);

      if (!delegation) {
        return { content: [{ type: "text", text: "Error: no se encontró la delegación activa con ese tool_call_id." }] };
      }

      if (!delegation.extend) {
        return { content: [{ type: "text", text: "Error: este subagente no soporta extensión de contexto." }] };
      }

      await delegation.extend(params.message);

      return {
        content: [{
          type: "text",
          text: `Contexto adicional enviado exitosamente al subagente ${delegation.subagentSessionId}.`,
        }],
      };
    },
  };
}
```

### Fase 5: UI del Frontend — Indicador de Extensión

**Archivo:** `apps/client/src/components/chat/tools/ToolCallRow.tsx`

Añadir un indicador visual cuando un subagente recibe una extensión:

```
┌─────────────────────────────────────────────┐
│ 🟢 sub_abc123 — Arreglando bug en auth.ts   │
│ ┌─────────────────────────────────────────┐ │
│ │ 📎 Extensión recibida:                   │ │
│ │ "También revisa el archivo tokens.ts"    │ │
│ │                          hace 5 segundos │ │
│ └─────────────────────────────────────────┘ │
│ [Ver Consola en Vivo]                       │
└─────────────────────────────────────────────┘
```

Implementar escucha del evento `extension_received` vía WebSocket:

```typescript
// En ChatArea.tsx
wsClient.on("extension_received", (data: { sessionId: string; content: string }) => {
  // Actualizar el tool call correspondiente para mostrar la extensión
  updateToolCallMetadata(data.sessionId, {
    extensions: [...(existing ?? []), { content: data.content, time: Date.now() }],
  });
});
```

---

## Diagrama de Flujo

```
Padre                                    Subagente
  │                                         │
  │──spawn_subagent(task="Analiza auth.ts")─▶│
  │                                         │ Inicia análisis
  │                                         │
  │  (descubre que también necesita         │
  │   revisar tokens.ts)                    │
  │                                         │
  │──extend_subagent(                       │
  │    tool_call_id="tc_1",                 │
  │    message="Revisa también tokens.ts"   │
  │  )──────────────────────────────────────▶│
  │                                         │ [CONTEXTO ADICIONAL]
  │                                         │ "Revisa también tokens.ts"
  │                                         │ → Inyectado en el bucle
  │                                         │ → Subagente ajusta su plan
  │                                         │
  │                                         │ Termina (con ambos archivos)
  │◀──resultado─────────────────────────────│
```

---

## Verificación

### Tests Automatizados

```typescript
describe("Subagent extend()", () => {
  it("inyecta mensaje de extensión en subagente activo", async () => {
    const subSession = await createAgentSession({...});
    await subSession.prompt("Analiza el archivo auth.ts");

    // Extender con contexto adicional
    await subSession.extend("Revisa también el archivo tokens.ts");

    expect(subSession.extensionQueue).toHaveLength(1);
  });

  it("lanza error si el subagente ya terminó", async () => {
    const subSession = await createAgentSession({...});
    // Subagente sin activeRun — ya terminó
    await expect(subSession.extend("Contexto tardío")).rejects.toThrow(
      "Cannot extend: subagent has already completed"
    );
  });

  it("drainNextExtension consume la cola en orden FIFO", () => {
    session.extend("msg1");
    session.extend("msg2");

    expect(session.drainNextExtension()?.content[0].text).toContain("msg1");
    expect(session.drainNextExtension()?.content[0].text).toContain("msg2");
    expect(session.drainNextExtension()).toBeUndefined();
  });

  it("extend_subagent tool encuentra delegación activa", async () => {
    delegationRegistry.register("user", "parent", "tc_1", {
      subagentSessionId: "sub_1",
      extend: async (msg) => { /* ... */ },
    });

    const result = await extendTool.execute("tc_2", {
      tool_call_id: "tc_1",
      message: "contexto adicional",
    });

    expect(result.content[0].text).toContain("enviado exitosamente");
  });
});
```

### Tests Manuales

1. **Extensión simple**: Spawnear subagente, esperar 2 segundos, extender con `extend_subagent`. Verificar en logs que el mensaje se inyectó.
2. **Extensión tardía**: Esperar a que el subagente termine, intentar extender → error descriptivo.
3. **Múltiples extensiones**: Extender 3 veces durante la ejecución de un subagente largo → todas se procesan en orden.

---

## Consideraciones

| Aspecto | Decisión |
|---|---|
| Límite de extensiones | Máximo 10 mensajes en cola. Si se excede, la extensión más antigua se descarta con warning. |
| Tamaño máximo por extensión | 4000 caracteres (consistente con truncado de delegaciones existentes). |
| Persistencia de la cola | Solo en memoria. Si el servidor se reinicia, las extensiones pendientes se pierden (el padre puede re-extender). |
| Visualización en frontend | Lista colapsable de extensiones debajo del ToolCallRow del subagente. |

---

## Orden de Ejecución

1. Añadir `extensionQueue` y método `extend()` a `AgentSession` (1 día)
2. Integrar `drainNextExtension()` en el AgentLoop del vendor (1 día)
3. Actualizar `DelegationRegistry` con soporte para `extend` (medio día)
4. Crear tool `extend_subagent` (1 día)
5. Añadir tool al sistema de tools del agente principal (medio día)
6. Frontend: escucha de evento `extension_received` + UI (1 día)
7. Tests automatizados (1 día)
8. Tests manuales (medio día)
