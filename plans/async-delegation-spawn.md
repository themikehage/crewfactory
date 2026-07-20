# Plan: Delegación y Spawn Asíncronos sin Bloqueo

**Prioridad:** Alta  
**Esfuerzo estimado:** 2-3 días  
**Riesgo:** Bajo-Medio (preserva compatibilidad con modo síncrono por defecto)  
**Área:** Funcionalidad / Subagentes / Herramientas  

---

## Resumen

Actualmente, las herramientas `spawn_subagent` y `delegate_task` operan bajo un modelo estrictamente síncrono para el agente padre: al invocarse, devuelven un resultado de herramienta indicando `terminate: true`. Esto detiene/pausa el bucle del agente padre de inmediato, obligándolo a esperar que el subagente o delegación termine en segundo plano para que el callback de finalización llame a `parent.continue()` y lo despierte con los resultados.

Este plan introduce la capacidad de realizar **delegaciones asíncronas no bloqueantes** (modelo PULL / Fire-and-Forget). El agente padre podrá decidir si quiere delegar y continuar trabajando en paralelo, consultando el estado y resultados de sus subagentes a demanda mediante una nueva herramienta `check_delegation`.

---

## Diseño Técnico

### 1. Parámetro `async` en Herramientas de Delegación

Modificaremos los esquemas y la ejecución de `spawn_subagent` y `delegate_task` para aceptar un parámetro opcional:
- `async` (boolean, default: `false`):
  - Si es `false` (síncrono/bloqueante, comportamiento actual):
    - La ejecución devuelve `{ terminate: true }` deteniendo el bucle del padre.
    - El callback en segundo plano despierta al padre llamando a `parent.continue()`.
  - Si es `true` (asíncrono/no bloqueante, nuevo modo):
    - La ejecución devuelve `{ terminate: false }` (o no establece `terminate`), permitiendo que el padre continúe de inmediato en el mismo turno.
    - El callback en segundo plano **NO** llama a `parent.continue()` al finalizar; simplemente actualiza el estado y el resultado en el `DelegationRegistry` y escribe el archivo JSON en disco.

### 2. Enriquecimiento del Mensaje de Inicio de Delegación

Cuando una herramienta de delegación es llamada con `async: true`, el retorno al LLM debe incluir:
1. El ID único de la delegación (`subagentSessionId` o `delegateSessionId`).
2. Una estimación de tiempo de ejecución basada en `maxSteps` (ej. `estimatedSeconds = maxSteps * 8`).
3. Instrucciones explícitas de que la delegación corre en segundo plano y que debe usar `check_delegation` más tarde para verificar el resultado.

### 3. Nueva Herramienta: `check_delegation`

Crearemos `check-delegation-tool.ts` con el siguiente contrato para el LLM:

```typescript
{
  name: "check_delegation",
  description: "Consulta el estado y resultado de una tarea delegada o subagente usando su ID de sesión.",
  parameters: {
    type: "object",
    properties: {
      delegationId: {
        type: "string",
        description: "El ID de sesión de la delegación (ej: sub_xxx o dlg_xxx)."
      }
    },
    required: ["delegationId"]
  }
}
```

#### Respuestas posibles de la herramienta:
- **En ejecución (Running)**:
  `{ status: "running", startedAt: "...", elapsedSeconds: 15 }`
- **Completado con éxito (Success)**:
  `{ status: "success", result: EnvelopeResult, completedAt: "..." }`
- **Error / Bloqueado**:
  `{ status: "error" | "blocked", result: EnvelopeResult, completedAt: "..." }`

### 4. Soporte en el `DelegationRegistry`

Añadiremos un método de búsqueda por ID de sesión en `apps/server/src/core/delegation-registry.ts`:

```typescript
getBySubagentSessionId(username: string, subagentSessionId: string): PendingDelegation | undefined {
  // Escanea los directorios de delegaciones del usuario buscando el archivo JSON que tenga matching subagentSessionId
}
```

---

## Cambios por Archivo

### Backend (`apps/server`)

#### [NEW] `apps/server/src/core/tools/check-delegation-tool.ts`
Implementar la definición y ejecución de la herramienta `check_delegation`.

#### [MODIFY] `apps/server/src/core/delegation-registry.ts`
Implementar `getBySubagentSessionId(username, subagentSessionId)`.

#### [MODIFY] `apps/server/src/core/tools/spawn-subagent-tool.ts`
- Añadir el parámetro `async` a los parámetros aceptados.
- Si `async: true`, retornar `{ terminate: false }` y no invocar `parent.continue()` al resolver la promesa de ejecución.
- Incluir `estimatedSeconds` en los detalles de retorno.

#### [MODIFY] `apps/server/src/core/tools/delegate-tool.ts`
- Añadir el parámetro `async` al esquema.
- Si `async: true`, retornar `{ terminate: false }` y no invocar `parent.continue()` al resolver la promesa de ejecución.
- Incluir `estimatedSeconds` en el mensaje de salida.

#### [MODIFY] `apps/server/src/core/session/tool-activation-engine.ts`
Agregar `"check_delegation"` a `alwaysOnTools`.

#### [MODIFY] `apps/server/src/agents/create-agent-server.ts`
Agregar `"check_delegation"` a la lista de `activeToolNames` del `AgentSession`.

#### [MODIFY] `apps/server/src/ai/agent-session.ts`
Instanciar e inyectar `check_delegation` en la inicialización de herramientas del agente.

#### [MODIFY] `apps/server/src/core/prompts/system-instructions.ts`
Documentar el nuevo comportamiento asíncrono y la herramienta `check_delegation` dentro de las instrucciones del sistema del agente para que el LLM comprenda el patrón PULL.

---

## Plan de Verificación

### Pruebas Automatizadas
1. Crear un test de integración en `apps/server/src/__tests__/async-delegation.test.ts` que verifique:
   - Llamar a `spawn_subagent` con `async: true` retorna `{ terminate: false }` de inmediato.
   - Mientras el subagente corre, llamar a `check_delegation` retorna `{ status: "running" }`.
   - Al finalizar el subagente, `parent.continue` no es invocado para la sesión asíncrona.
   - Llamar a `check_delegation` después de finalizar retorna `{ status: "success", result: {...} }`.

### Pruebas Manuales
1. Iniciar el servidor localmente con `bun run dev`.
2. Lanzar un prompt al agente orquestador que requiera delegación en segundo plano (ej: *"Lanza un subagente de forma asíncrona para que revise los logs e infórmame de su ID"*).
3. Confirmar que el agente responde de inmediato con el ID del subagente sin pausarse.
4. Pedirle que consulte el estado de la tarea (ej: *"Consulta el estado de sub_xxx"*). Confirmar el retorno estructurado del resultado.
