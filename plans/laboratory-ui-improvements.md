COMPLETED 
# Laboratory UI Improvements — Streaming, Model Defaults & Responsive Chat

**Fecha:** 2026-07-02
**Tipo:** Mejora de UI sobre Phase 49 (Laboratory ya implementado)

## Problemas identificados (4 areas)

### A. Pasos del wizard que llaman LLM sin streaming

Dos pasos del wizard bloquean la UI con un spinner mientras el LLM procesa:

| Paso | Endpoint | Server Method | Que hace el usuario |
|------|----------|---------------|---------------------|
| Wizard Step 1→2 | `POST /api/experiments/analyze` | `AgentGenerator.analyzeTask()` → `session.prompt()` | Espera con spinner, sin feedback |
| Wizard Step 2→3 | `POST /api/experiments/generate-briefings` | `AgentGenerator.generateStanceBriefings()` → `session.prompt()` | Espera con spinner, sin feedback |

**Codigo actual (problema):**
- `LaboratoryPage.tsx:188-209` — `handleAnalyzeTask`: solo muestra `<span className="animate-spin">Analizando Tarea...</span>`
- `LaboratoryPage.tsx:222-276` — `handleGenerateStances`: solo muestra `<span className="animate-spin">Generando Agentes...</span>`
- `agent-generator.ts:36` — `await session.prompt(promptText)` — bloquea hasta respuesta completa, luego parsea JSON del ultimo mensaje
- `agent-generator.ts:105` — `await session.prompt(promptText)` — mismo patron bloqueante

El usuario no ve que esta generando el LLM. Si la respuesta tarda 15-30 segundos o falla el parseo del JSON, no hay feedback intermedio.

### B. Modelo por defecto hardcodeado, sin conexion al agente global

El modelo default `"anthropic/claude-3-5-sonnet"` esta hardcodeado en 4 lugares sin relacion con el modelo que el usuario ya tiene configurado y usando en el agente global:

| Archivo | Linea | Contexto |
|---------|-------|----------|
| `LaboratoryPage.tsx` | 235 | `const defaultModel = "anthropic/claude-3-5-sonnet"` — usado para inicializar todos los agentes del wizard |
| `LaboratoryPage.tsx` | 263 | Mismo default para el agente Moderador |
| `LaboratoryPage.tsx` | 295 | Mismo default para el agente baseline Single |
| `experiments.ts` | 65-66 | `fallbackModel = "anthropic/claude-3-5-sonnet"` — server-side para blueprints |

El `ModelSelector` actual soporta modo controlado (prop `value` + `onChange`), y lee de `localStorage.getItem("pi-selected-model")` en modo no controlado. Pero en el wizard no se usa esa informacion — siempre arranca con el hardcode.

Ademas, en el Step 3 (Briefings & Modelos), cada agente tiene su propio `ModelSelector` individual. No hay forma de cambiar el modelo de TODOS los agentes a la vez — el usuario tiene que ir uno por uno.

### C. UI de streaming en ejecucion (LiveStreamColumn) con multiples carencias

La vista de experimento en ejecucion (`LaboratoryPage.tsx:916-938`) renderiza 3 columnas con `LiveStreamColumn`. Esta funcion interna tiene los siguientes problemas:

**C1. Mensajes desaparecen al cambiar de experimento**
- `LiveStreamColumn` llama `useChannel(expStatus === "running" ? channelId : null)` (linea 364)
- Cuando `expStatus` no es `"running"` (ej: el usuario selecciona otro experimento), pasa `null` → el hook cierra el WebSocket y limpia los mensajes
- Al volver al experimento, los mensajes se perdieron. El unico contenido visible es `result.finalOutput` que llega via polling del experimento completo

**C2. Sin auto-scroll**
- El div del scroll (`overflow-y-auto` en linea 380) no tiene `useRef` ni `scrollIntoView`
- Contraste con `ChatArea.tsx:78-95` que tiene `SCROLL_THRESHOLD = 50`, `isAtBottomRef`, `handleScroll`, `scrollToBottom` — un sistema completo de smart-scroll
- Contraste con `ChannelMessageList.tsx:59-63` que al menos tiene `bottomRef` + `scrollIntoView({behavior: "smooth"})` basico

**C3. Renderizado de mensajes rudimentario**
- Solo `ReactMarkdown` con `remarkGfm` (lineas 389-391)
- No soporta: bloques de pensamiento (`ThinkingBlock`), tool calls (`ToolCallRow`), streaming agent state con badge "STREAMING" y dots animados
- `ChannelMessageList.tsx` ya tiene resuelto todo esto: `ThinkingBlock` (lineas 15-38), `ToolCallRow` (lineas 123-131), streaming agents render (lineas 139-186), mencion highlighting (lineas 40-49), `RichMarkdown`

**C4. La UI de mensajes no refleja el estado de streaming inter-agent**
- El backend del channel orchestrator emite `channel_agent_token`, `channel_agent_start`, `channel_agent_end`, `channel_agent_thinking`, `channel_agent_tool_start/end`
- El hook `useChannel` ya procesa todos estos eventos y mantiene `streamingAgents: Record<string, StreamingAgentState>`
- Pero `LiveStreamColumn` solo usa `messages` del hook, ignora completamente `streamingAgents`

### D. Layout responsive sin sistema de tabs

**Estado actual (linea 916):**
```tsx
<div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
  <LiveStreamColumn ... />
  <LiveStreamColumn ... />
  <LiveStreamColumn ... />
</div>
```

- En `xl` (1280px+): 3 columnas, OK
- En pantallas menores: 3 columnas stacked verticalmente. El usuario tiene que scrollear MUCHO para ver las 3. Si la primera columna tiene 450px de alto, tiene que scrollear 1350px para ver la tercera.
- No hay tabs para alternar entre variantes

**Patron a seguir:** `ChannelChatArea.tsx:136-186` tiene un sistema de tabs horizontal (`Chat | Org Chart | Tareas | Benchmark | Optimizar`) con botones condicionalmente estilizados (`bg-surface text-text-primary border` cuando activo, `text-text-secondary hover:text-text-primary` cuando inactivo).

## Solucion propuesta

### A. Streaming para analisis y generacion de briefings

**Server-side:**
1. Crear dos nuevos endpoints SSE:
   - `GET /api/experiments/analyze/stream?taskPrompt=...` — streaming SSE del analisis
   - `GET /api/experiments/generate-briefings/stream?taskPrompt=...&dichotomies=...` — streaming SSE de briefings

2. Modificar `AgentGenerator` para exponer metodos con streaming:
   - `analyzeTaskStream()`: crea sesion, subscribe a eventos `text_delta`, emite como SSE, al finalizar parsea JSON y emite evento `result`
   - `generateStanceBriefingsStream()`: mismo patron

3. Formato de eventos SSE:
   ```
   data: {"type":"delta","text":"analizando la tarea..."}
   data: {"type":"delta","text":" identificando dicotomias relevantes..."}
   data: {"type":"result","suggestedDichotomies":[...],"criteria":[...]}
   ```

**Client-side:**
1. Crear hook `useExperimentStream(url: string)` para consumir SSE
2. Reemplazar el spinner por:
   - Un panel colapsable de streaming text que muestra el contenido en tiempo real
   - Un badge "Generando..." con indicador de actividad
   - Cuando llega `result`, transicionar automaticamente al siguiente paso del wizard
3. Mantener el fallback actual (spinner) si el SSE falla

### B. Selector de modelo default inteligente

**Client-side:**
1. Al entrar al wizard Step 3, leer el modelo actual del localStorage (`pi-selected-model`) y de `/api/models`
2. Agregar UN `ModelSelector` global en la cabecera del Step 3 con label "Modelo por defecto para todos los agentes"
3. Al cambiar este selector global, actualizar TODOS los agentes simultaneamente
4. Los `ModelSelector` individuales por agente se mantienen para overrides finos
5. Si el usuario cambia el global, resetea los individuales al nuevo valor (para consistencia)

**Server-side:**
1. En `experiments.ts:65-66`, reemplazar el array hardcodeado por una consulta a `modelRegistry.getAvailable()` del usuario
2. Si no hay modelos configurados, usar el fallback del agente global (leer de `auth.json` o `credentials.json`)

### C. Refactor de LiveStreamColumn → reutilizar ChannelMessageList

**C1. Persistencia de mensajes entre experimentos**

Opcion recomendada: **Cache en el estado del padre**

```tsx
// En LaboratoryPage:
const [channelMessages, setChannelMessages] = useState<Record<string, ChannelMessage[]>>({});

// LiveStreamColumn recibe los mensajes cacheados + una callback para actualizar
<LiveStreamColumn
  channelId={...}
  cachedMessages={channelMessages[channelId] || []}
  onMessagesUpdate={(msgs) => setChannelMessages(prev => ({...prev, [channelId]: msgs}))}
  ...
/>
```

El hook `useChannel` se sigue usando, pero el estado de mensajes se persiste en el padre. Cuando el usuario cambia de experimento, el componente anterior se desmonta pero los mensajes quedan en `channelMessages`. Al volver, se hidratan del cache.

**C2. Auto-scroll**

Implementar el mismo patron de `ChannelMessageList.tsx:59-63` usando `bottomRef` + `scrollIntoView`:
```tsx
const bottomRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: "smooth" });
}, [messages, streamingAgents]);
```

Opcional: copiar el smart-scroll de `ChatArea` (respeta posicion del usuario si scrolleó hacia arriba).

**C3. Reutilizar ChannelMessageList**

Reemplazar TODO el renderizado de mensajes custom (lineas 381-404) por `<ChannelMessageList>`, que ya provee:
- `ThinkingBlock` para razonamiento de agentes
- `ToolCallRow` para tool calls colapsables
- `RichMarkdown` con GFM + syntax highlighting
- Streaming agents en tiempo real con badge "STREAMING" + dots animados
- Mencion highlighting
- Auto-scroll via `bottomRef`

El unico cambio necesario: `ChannelMessageList` espera `messages: ChannelMessage[]` y `streamingAgents: Record<string, StreamingAgentState>`. El hook `useChannel` ya retorna exactamente esto.

**C4. Pasar streamingAgents a la vista**

`LiveStreamColumn` actualmente solo desestructura `{ messages }` de `useChannel`. Hay que desestructurar tambien `streamingAgents` y pasarlo a `ChannelMessageList`.

### D. Sistema de tabs responsive para variantes

**Layout propuesto:**

```tsx
{/* Tabs para seleccion de variante */}
<div className="flex items-center gap-1 bg-surface border border-surface-hover rounded-lg p-0.5 mb-4">
  {["single", "multiNoLeader", "multiWithLeader"].map((variant) => (
    <button
      key={variant}
      onClick={() => setActiveVariantTab(variant)}
      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
        activeVariantTab === variant
          ? "bg-bg text-accent border border-surface-hover"
          : "text-text-secondary hover:text-text-primary"
      }`}
    >
      {variant === "single" && "Single (Baseline)"}
      {variant === "multiNoLeader" && "Multi (Horizontal)"}
      {variant === "multiWithLeader" && "Multi + Lider"}
    </button>
  ))}
</div>

{/* Solo renderiza la columna activa */}
<LiveStreamColumn ... />
```

- Por defecto en mobile: una columna con tabs
- En desktop (`xl:`): opcionalmente mantener 3 columnas como ahora, o tabs tambien
- El tab activo determina cual `LiveStreamColumn` se renderiza
- Las otras variantes se mantienen en el arbol React pero con `hidden` (para no perder conexion WebSocket) o se desmontan (cache de mensajes las preserva)

## Archivos a modificar

### Server

| Archivo | Cambio |
|---------|--------|
| `apps/server/src/laboratory/agent-generator.ts` | Nuevos metodos `analyzeTaskStream()` y `generateStanceBriefingsStream()` con streaming SSE |
| `apps/server/src/routes/experiments.ts` | Nuevos endpoints SSE `/analyze/stream` y `/generate-briefings/stream`; reemplazar `fallbackModel` hardcodeado por `modelRegistry.getAvailable()` |
| `apps/server/src/core/session-manager.ts` | Exponer helper `getUserDefaultModel(username)` para consultar el modelo del agente global |

### Client

| Archivo | Cambio |
|---------|--------|
| `apps/client/src/pages/LaboratoryPage.tsx` | **Refactor principal**: agregar cache de mensajes, reemplazar `LiveStreamColumn` interna por uso de `ChannelMessageList`, agregar sistema de tabs responsive, agregar streaming SSE en wizard steps, agregar `ModelSelector` global en Step 3 |
| `apps/client/src/hooks/useExperimentStream.ts` | **NUEVO** — hook para consumir endpoints SSE de analisis y generacion |
| `apps/client/src/components/laboratory/VariantLiveColumn.tsx` | **NUEVO** (extraer de `LaboratoryPage.tsx`) — componente independiente con `ChannelMessageList`, auto-scroll, y cache de mensajes |

### No se modifican

- `ChannelMessageList.tsx` — se reusa tal cual
- `ModelSelector.tsx` — ya soporta modo controlado
- `useChannel.ts` — ya retorna `messages` + `streamingAgents`
- `ChannelChatArea.tsx` — patron de tabs a seguir, no se modifica
- `experiment-runner.ts` — la ejecucion no cambia
- `experiment-store.ts` — el storage no cambia

## Plan de fases

### Fase 1: Streaming SSE en wizard (Server + Client)
1. Server: `analyzeTaskStream()` + `generateStanceBriefingsStream()` en `agent-generator.ts`
2. Server: endpoints SSE en `routes/experiments.ts`
3. Client: hook `useExperimentStream.ts`
4. Client: reemplazar spinners por streaming text en Steps 1→2 y 2→3
5. Validar: el wizard completa correctamente con streaming activo

### Fase 2: Model Selector inteligente
1. Client: leer modelo global de localStorage + `/api/models`
2. Client: agregar `ModelSelector` global en Step 3 con propagacion a todos los agentes
3. Server: `getUserDefaultModel()` en `session-manager.ts`
4. Server: reemplazar hardcode en `experiments.ts` por consulta dinamica
5. Validar: selector muestra el modelo correcto del agente global, cambiar el global actualiza todos los agentes

### Fase 3: Refactor LiveStreamColumn + ChannelMessageList
1. Extraer `VariantLiveColumn.tsx` como componente independiente
2. Reemplazar renderizado custom por `<ChannelMessageList>`
3. Implementar auto-scroll con `bottomRef`
4. Pasar `streamingAgents` a `ChannelMessageList`
5. Implementar cache de mensajes en el estado de `LaboratoryPage` para persistencia entre experimentos
6. Validar: mensajes persisten al cambiar de experimento y volver, scroll automatico funciona, streaming agents se ven con badge

### Fase 4: Tabs responsive
1. Agregar estado `activeVariantTab` en `LaboratoryPage`
2. Implementar barra de tabs horizontal (patron `ChannelChatArea`)
3. En `xl`: mantener 3 columnas o tabs (decidir con usuario)
4. En `<xl`: renderizar solo la variante activa via tabs
5. Validar: tabs funcionan en mobile, las otras variantes no se desmontan (mantienen WebSocket)

## Riesgos

1. **Parseo de JSON en streaming**: el LLM podria generar JSON invalido o incompleto en medio del stream. **Mitigacion:** solo parsear al recibir el evento `result` final; durante el streaming mostrar texto libre sin intentar parsear.

2. **Conexiones WebSocket acumuladas**: si mantenemos 3 `LiveStreamColumn` conectadas simultaneamente para evitar perder mensajes, son 3 WebSockets extra. **Mitigacion:** usar el cache de mensajes + desmontar columnas no visibles; solo la columna del tab activo mantiene WebSocket.

3. **Regresion en el wizard**: el streaming SSE reemplaza llamadas REST que funcionan. **Mitigacion:** mantener los endpoints REST originales como fallback y agregar los nuevos SSE como endpoints adicionales. El cliente intenta SSE primero, cae a REST si falla.

4. **Modelo global no configurado**: si el usuario nunca uso el chat y no tiene modelo en localStorage, el default sigue siendo necesario. **Mitigacion:** mantener un fallback chain: localStorage → `/api/models` (primer modelo configurado) → `"anthropic/claude-3-5-sonnet"` (ultimo recurso).
