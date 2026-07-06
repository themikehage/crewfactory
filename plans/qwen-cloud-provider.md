COMPLETED ✅ 
# Qwen Cloud como Provider en CrewFactory

## Motivacion

Qwen (DashScope) ofrece modelos competitivos (Qwen3-Plus, Qwen3-Turbo, etc.) con una API
compatible con OpenAI. Agregarlo como provider nativo en CrewFactory permite usar estos modelos
directamente desde el UI, sin tener que proxyar por otro lado.

## Enfoque Tecnico

La API de Qwen Cloud es OpenAI-compatible (`/v1/chat/completions`). El vendored agent runtime ya tiene
`streamSimpleOpenAICompletions` que maneja ese formato. Solo necesitamos registrar el provider
con los modelos correctos via `ModelRegistry.registerProvider()`.

El SDK expone `registerProvider()` publicamente en la clase `ModelRegistry`. Podemos llamarlo
despues de crear el registry en `session-manager.ts`, justo despues de `modelRegistry.refresh()`.

## Modelos a Registrar

Basado en la [documentacion oficial de Qwen](https://help.aliyun.com/zh/model-studio/getting-started/models),
los modelos principales (Julio 2026):

| Model ID | Contexto | Max Tokens | Razonamiento | Vision | Costo (input / output por 1M tokens) |
|---|---|---|---|---|---|
| `qwen3.7-plus` | 32K (131K thinking) | 32K | si | si | $5 / $16 |
| `qwen3.7-turbo` | 32K (131K thinking) | 32K | si | si | $2 / $8 |
| `qwen3.6-plus` | 32K (131K thinking) | 32K | si | si | $5 / $16 |
| `qwen3.6-turbo` | 32K (131K thinking) | 32K | si | si | $2 / $8 |
| `qwen3-plus` | 32K (131K thinking) | 32K | si | si | $5 / $16 |
| `qwen3-turbo` | 32K (131K thinking) | 32K | si | si | $2 / $8 |
| `qwq-32b-preview` | 32K | 8K | si (solo thinking) | no | $2 / $8 |

> Nota: Los costos y capacidades exactas pueden variar. Verificar docs oficiales al implementar.

## Archivos a Modificar

### 1. `apps/server/src/core/qwen-provider.ts` (NUEVO)

Provider definition standalone con:
- Models list con IDs, nombres, costos, context window
- `streamSimple` que wrappea `streamSimpleOpenAICompletions` configurando la base URL correcta
- Compat flags necesarias para Qwen (`cacheControlFormat: "none"`, etc.)

### 2. `apps/server/src/core/session-manager.ts`

En `getUserContext()`, despues de `modelRegistry.refresh()`, llamar
`registerQwenProvider(modelRegistry, authStorage)`.

```typescript
// Llamar esto despues de crear el modelRegistry
registerQwenProvider(modelRegistry, authStorage);
```

### 3. `apps/server/src/core/session-manager.ts` — key injection

El API key de DashScope se guarda via el UI como cualquier otro provider (en auth.json).
El `AuthStorage` maneja el key management. Cuando se registra el provider con
`apiKey: "$DASHSCOPE_API_KEY"` o sin apiKey fijo, se usa el authStorage que ya tiene el
key para "qwen".

Opciones para el env var / apiKey:
- Usar `"$DASHSCOPE_API_KEY"` como referencia a env var del sistema (coolify)
- O dejar que el usuario configure el key via UI como cualquier otro provider
- Mejor: ambas — que funcione con env var O con UI

### 4. `apps/client/` — Sin cambios (ya funciona)

El `GET /api/providers` ya itera sobre `modelRegistry.getAll()` y agrupa por provider.
Cualquier provider registrado via `registerProvider()` aparece automaticamente en el UI.
El selector de modelos ya soporta nested dropdown por provider.

## Detalles Tecnicos de `streamSimple`

El vendored agent runtime tiene los built-in providers registrados globalmente. Cuando hacemos:

```typescript
modelRegistry.registerProvider("qwen", {
  name: "Qwen Cloud",
  baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  apiKey: "$DASHSCOPE_API_KEY",
  api: "openai-completions",
  models: [...],
});
```

El SDK resuelve el streaming usando el built-in `streamSimpleOpenAICompletions` porque
`api: "openai-completions"` ya esta registrado como provider API. **No necesitamos pasar
un `streamSimple` custom** — el SDK usa el que corresponde al `api` type.

Sin embargo, hay que verificar que Qwen soporte los mismos parametros que OpenAI
(tool_calls, streaming, etc.). Si Qwen tiene diferencias en el formato, ahi si
necesitariamos un `streamSimple` custom.

### Compat Flags Potenciales

Qwen puede necesitar estos ajustes en el model compat:

```typescript
compat: {
  cacheControlFormat: "none", // Qwen no soporta cache_control tipo OpenAI
  supportsCacheControlOnTools: false,
}
```

## Plan de Implementacion

1. **Investigar**: confirmar modelos activos y capacidades de Qwen Cloud (tool calling,
   streaming format, razonamiento).
2. **Crear** `apps/server/src/core/qwen-provider.ts` con la definicion del provider.
3. **Modificar** `apps/server/src/core/session-manager.ts` para registrar el provider.
4. **Test**: iniciar servidor, verificar que Qwen aparece en `GET /api/providers`.
5. **Test**: configurar API key via UI, seleccionar modelo, enviar mensaje.
6. **Test**: verificar streaming, tool calls, abort.

## Riesgos

- **Qwen puede no soportar tool calls exactamente como OpenAI**: si el formato de
  `tool_calls` es distinto, necesitamos `streamSimple` custom.
- **Compatibilidad de streaming**: Qwen usa SSE como OpenAI, pero podria tener diferencias
  en los campos de los eventos.
- **Razonamiento (thinking)**: Qwen3 soporta razonamiento, pero puede requerir flags
  especiales en el payload.
- **Rate limits**: DashScope tiene sus propios rate limits que pueden diferir de OpenAI.
- **CORS**: no aplica porque es server-to-server (Bun -> DashScope).

## Referencias

- [Qwen API Docs](https://help.aliyun.com/zh/model-studio/getting-started/models)
- [DashScope API compatible-mode](https://help.aliyun.com/zh/model-studio/developer-reference/use-qwen-by-calling-api-based-on-openai-compatible-mode)
- Codigo ejemplo de `streamSimpleOpenAICompletions` en `node_modules/@earendil-works/pi-ai/dist/providers/openai-completions.js`
- Ejemplo de custom provider con Anthropic: `node_modules/@earendil-works/pi-coding-agent/examples/extensions/custom-provider-anthropic/index.ts`
- Ejemplo de custom provider con GitLab Duo: `node_modules/@earendil-works/pi-coding-agent/examples/extensions/custom-provider-gitlab-duo/index.ts`
