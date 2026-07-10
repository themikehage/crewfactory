COMPLETED
# Fast Decompose Tasks — Plan de Optimización

## Problema
`decompose_tasks` crea una sesión secundaria completa (`plan_${toolCallId}`) y ejecuta el agent loop entero solo para obtener un JSON. El overhead incluye:

- Inicialización de ResourceLoader, system prompt, skills
- Resolución de modelo y API keys
- Ciclo completo de streaming (message_start, message_update, message_end, events)
- Destrucción de la sesión al finalizar

El LLM además recibe un prompt extenso que lo obliga a "planificar" textualmente antes de emitir el JSON.

## Solución Propuesta

### Fase 1: Reemplazar el agent loop por llamada directa (streamSimple)

**Archivo:** `apps/server/src/core/tools/decompose-tool.ts`

En vez de `planSession.prompt(promptText)`, usar `streamSimple()` directo:

```
1. Construir prompt mínimo de descomposición (sin system prompt de agente)
2. Crear mensajes: [{ role: "user", content: prompt }]
3. Llamar streamSimple(model, { messages, systemPrompt: mínima }, options)
4. Acumular texto del stream
5. Parsear JSON directamente
```

Esto elimina:
- Creación de sesión secundaria
- ResourceLoader y system prompt del workspace
- Tool loading y event lifecycle
- Streaming bidireccional al frontend

**Firma a usar:**
```typescript
import { streamSimple } from "../vendor/ai/src/compat.ts";

const stream = streamSimple(model, {
  systemPrompt: "You are a task decomposition engine. Output ONLY JSON.",
  messages: [{ role: "user" as const, content: prompt }],
}, { signal, apiKey: model.apiKey });

for await (const event of stream) {
  if (event.type === "text_delta") text += event.delta;
  if (event.type === "error") throw new Error(event.error);
}
```

### Fase 2: Simplificar el prompt de descomposición

Actualmente `buildDecomposePrompt()` produce ~50 líneas con:
- Contexto detallado del role "meticulous software architect"
- Ejemplos de JSON con todos los campos
- Reglas extensas sobre IDs, dependecias, etc.

Versión más ligera:
- Instrucción concisa: "Return a JSON array of tasks"
- `prompt` de cada tarea auto-contenido (se mantiene)
- Eliminar prosa redundante y ejemplos largos

### Fase 3: (Opcional) Caché de modelo/resolución

Actualmente resuelve el modelo del parent session y lo pasa al plan session (line 160-162). Con streamSimple directo, se usa directamente el modelo existente sin necesidad de pasarlo por otra sesión.

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `apps/server/src/core/tools/decompose-tool.ts` | Reemplazar `planSession.prompt()` por `streamSimple()`. Eliminar creación/destrucción de sesión secundaria. Simplificar prompt. |

## Archivos a eliminar

Ninguno. La sesión `plan_*` ya no se crea, pero el resto del flujo (tasks.json, broadcast, parseo) se mantiene intacto.

## Beneficios esperados

- **Latencia**: ~40-60% más rápido (elimina setup de sesión + tool loading + lifecycle events)
- **Simplicidad**: Código reducido, sin sesiones temporales que limpiar
- **Tokens**: Sin system prompt de workspace ni tool definitions en contexto

## Riesgos

- Si `streamSimple` no está disponible en el compat layer, usar `stream()` directamente con un Provider
- La resolución de API keys y auth debe hacerse manualmente (ya se hace vía `this.modelRegistry.getApiKeyAndHeaders`)
- Perderíamos la persistencia de la respuesta de descomposición (sesión plan_ se borraba al final igual, así que no hay pérdida real)

## Verificación

- `bun run build` desde `apps/server`
- Probar `decompose_tasks` en modo `linear` y `dag`
- Verificar que tasks.json se escribe correctamente
- Verificar que el broadcast `tasks_update` llega al frontend
- Verificar que la UI muestra el plan en el acordeón flotante
