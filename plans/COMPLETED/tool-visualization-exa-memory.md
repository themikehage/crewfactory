COMPLETED
# Plan: Tool Visualization — Exa Search & Engram Memory

**Fecha:** 2026-07-07
**Estado:** Propuesta

## Problema

`exa_search` y `engram_store/recall/forget` se renderizan con el caso `default` del `ToolBody`:
- Sin icono propio en `TOOL_META` (usan el dot gris genérico)
- Sin resumen de argumentos en `getArgSummary` (muestra JSON crudo truncado a 50 chars)
- Sin resumen de resultado en `getResultSummary` (siempre "done")
- Sin componente dedicado — todo el output va a un `<pre>` con texto plano
- El server ya envía `details` ricos (results[], memories[], synthesizedOutput) pero el client no los aprovecha

## Objetivo

Rendering estructurado y visual para ambos tools, siguiendo el patrón existente de componentes dedicados (`BashResult`, `GrepResult`, `EditResult`, etc.).

---

## Análisis del Estado Actual

### Server — datos disponibles

**exa_search** retorna `details`:
```typescript
{
  totalResults: number,
  searchType: string,
  requestId: string,
  results: [{ title, url, publishedDate }],
  costDollars?: number,
  synthesizedOutput?: string,
  grounding?: unknown
}
```

**engram_recall** retorna `details`:
```typescript
{
  count: number,
  memories: [{ id, type, importance, content, tags }]
}
```

**engram_store** retorna `details`:
```typescript
{
  status: "success",
  type: MemoryType,
  importance: number,
  tags: string[]
}
```

**engram_forget** retorna `details`:
```typescript
{
  status: "success",
  deletedId: string
}
```

### Client — lo que falta

| Capada | exa_search | engram_* |
|--------|-----------|----------|
| `TOOL_META` | No tiene | No tiene |
| `getArgSummary` | default (JSON) | default (JSON) |
| `getResultSummary` | default ("done") | default ("done") |
| `ToolBody` | default (`<pre>`) | default (`<pre>`) |
| `ToolResultData.details` type | Solo `{diff?, patch?}` | Solo `{diff?, patch?}` |
| Componente dedicado | No | No |
| Literals i18n | No | No |
| Auto-expand | No | No |

---

## Implementación

### Step 1: Extender tipos en el client

**Archivo:** `apps/client/src/components/chat/tools/ToolCallRow.tsx`

Extender `ToolResultData.details` para soportar los shapes de exa y engram:

```typescript
export interface ToolResultData {
  toolName: string;
  content: ToolContentBlock[];
  isError: boolean;
  details?: {
    diff?: string;
    patch?: string;
    firstChangedLine?: number;
    // exa_search
    totalResults?: number;
    searchType?: string;
    results?: Array<{ title?: string; url: string; publishedDate?: string }>;
    synthesizedOutput?: string;
    costDollars?: number;
    // engram
    count?: number;
    memories?: Array<{ id: string; type: string; importance: number; content: string; tags?: string[] }>;
    status?: string;
    type?: string;
    importance?: number;
    tags?: string[];
    deletedId?: string;
  };
}
```

### Step 2: TOOL_META — iconos y labels

**Archivo:** `apps/client/src/components/chat/tools/ToolCallRow.tsx`

Agregar 4 entradas al `TOOL_META`:

| Tool | Label | Color | Icono |
|------|-------|-------|-------|
| `exa_search` | `"exa"` | `text-highlight` | Lupa con ondas (búsqueda semántica) |
| `engram_store` | `"memory"` | `text-accent` | Cerebro/chip con + (guardar) |
| `engram_recall` | `"memory"` | `text-accent` | Cerebro/chip con lupa (buscar) |
| `engram_forget` | `"memory"` | `text-error` | Cerebro/chip con - (borrar) |

Los 3 engram comparten familia visual pero se distinguen por color y micro-variación del icono.

### Step 3: getArgSummary — resumen de argumentos

| Tool | Output |
|------|--------|
| `exa_search` | `args.query` (truncado a 60 chars) |
| `engram_store` | Preview de `args.content` (primeros 50 chars) |
| `engram_recall` | `args.query` (truncado a 60 chars) |
| `engram_forget` | `args.id` |

### Step 4: getResultSummary — resumen de resultado

| Tool | Output |
|------|--------|
| `exa_search` | `"N results"` (de `details.totalResults` o contando líneas) |
| `engram_store` | `"stored"` |
| `engram_recall` | `"N memories"` (de `details.count`) |
| `engram_forget` | `"forgotten"` |

### Step 5: Componente `ExaSearchResult.tsx`

**Archivo:** `apps/client/src/components/chat/tools/ExaSearchResult.tsx`

Layout:
```
┌─────────────────────────────────────────────┐
│ [query badge] 10 results · auto · $0.002   │
├─────────────────────────────────────────────┤
│ 1. Title of the result                      │
│    example.com              2025-06-15      │
│    > Highlight excerpt text...              │
│    > Another highlight...                   │
├─────────────────────────────────────────────┤
│ 2. Another result title                     │
│    docs.example.com         2025-03-20      │
│    > Highlight excerpt...                   │
├─────────────────────────────────────────────┤
│ ▼ Synthesized Output (collapsible)          │
│   [LLM synthesized answer text...]          │
└─────────────────────────────────────────────┘
```

Detalles:
- Cada resultado es una card mínima con title (link externo), domain+date en secondary
- Highlights como blockquotes con `text-muted-foreground` y left border accent
- Synthesized output en un `<details>` collapsible al final (solo si existe)
- Costo mostrado como badge sutil si está disponible
- Max 5 resultados visibles, resto colapsable con "Show N more"
- Framer Motion para expand/collapse

### Step 6: Componente `EngramResult.tsx`

**Archivo:** `apps/client/src/components/chat/tools/EngramResult.tsx`

Tres sub-variantes según el tool:

**engram_recall** (la más rica):
```
┌─────────────────────────────────────────────┐
│ 3 memories recalled                         │
├─────────────────────────────────────────────┤
│ [semantic] ●●●○○ (0.8)  ID: abc123         │
│ "The JWT secret is stored in env vars..."   │
│  #auth #config                              │
├─────────────────────────────────────────────┤
│ [episodic] ●●○○○ (0.5)  ID: def456         │
│ "User deployed to Coolify on July 5th..."   │
│  #deploy #ops                               │
└─────────────────────────────────────────────┘
```

**engram_store** (confirmación):
```
┌─────────────────────────────────────────────┐
│ [semantic] Memory stored (importance: 0.7)  │
│ "Fixed N+1 query in UserList by adding..."  │
│  #bugfix #database                          │
└─────────────────────────────────────────────┘
```

**engram_forget** (confirmación mínima):
```
┌─────────────────────────────────────────────┐
│ Memory abc123 deleted                       │
└─────────────────────────────────────────────┘
```

Detalles:
- Type badges con colores: semantic=accent, episodic=highlight, procedural=warning
- Importance como dots visuales (3-5 circles filled/unfilled)
- Content con max-height y scroll si es muy largo
- Tags como chips pequeños con `bg-surface`
- ID en font-mono text-secondary

### Step 7: ToolBody — wirear casos

**Archivo:** `apps/client/src/components/chat/tools/ToolCallRow.tsx`

Agregar en el switch del `ToolBody`:
```typescript
case "exa_search":
  return <ExaSearchResult text={text} details={result?.details} />;
case "engram_recall":
  return <EngramResult mode="recall" details={result?.details} />;
case "engram_store":
  return <EngramResult mode="store" args={args} details={result?.details} />;
case "engram_forget":
  return <EngramResult mode="forget" details={result?.details} />;
```

### Step 8: Auto-expand

Agregar `exa_search`, `engram_recall` al array de auto-expand en `ToolCallRow`:
```typescript
const [expanded, setExpanded] = useState(
  !disabled && (
    toolName === "edit" ||
    toolName === "bash" ||
    // ... existing ...
    toolName === "exa_search" ||
    toolName === "engram_recall" ||
    toolName === "engram_store"
  )
);
```

### Step 9: Literals i18n

**Archivo:** `apps/client/src/components/chat/tools/ToolCallRow.literals.ts`

Agregar:
```typescript
// en
labelExaSearch: "exa",
labelMemory: "memory",
argExaQuery: "",  // uses args.query directly
argMemoryQuery: "",  // uses args.query directly
resExaResults: "results",
resMemories: "memories",
resStored: "stored",
resForgotten: "forgotten",
bodySynthesizedOutput: "Synthesized Output",
bodyShowMore: "Show {n} more",
bodyNoMemories: "No relevant memories found",

// es
labelExaSearch: "exa",
labelMemory: "memoria",
resExaResults: "resultados",
resMemories: "memorias",
resStored: "guardado",
resForgotten: "eliminado",
bodySynthesizedOutput: "Output sintetizado",
bodyShowMore: "Mostrar {n} más",
bodyNoMemories: "No se encontraron memorias relevantes",
```

---

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `apps/client/src/components/chat/tools/ToolCallRow.tsx` | TOOL_META, getArgSummary, getResultSummary, ToolBody switch, auto-expand, details type |
| `apps/client/src/components/chat/tools/ToolCallRow.literals.ts` | Nuevos literals para exa y engram |

## Archivos a Crear

| Archivo | Descripción |
|---------|-------------|
| `apps/client/src/components/chat/tools/ExaSearchResult.tsx` | Componente de rendering para resultados de Exa Search |
| `apps/client/src/components/chat/tools/EngramResult.tsx` | Componente de rendering para los 3 tools de Engram memory |

---

## Orden de Implementación

| # | Step | Complejidad |
|---|------|-------------|
| 1 | Extender `ToolResultData.details` type | Baja |
| 2 | Agregar `TOOL_META` entries (4 tools) | Baja |
| 3 | Agregar `getArgSummary` cases | Baja |
| 4 | Agregar `getResultSummary` cases | Baja |
| 5 | Crear `ExaSearchResult.tsx` | Media |
| 6 | Crear `EngramResult.tsx` | Media |
| 7 | Wirear casos en `ToolBody` switch | Baja |
| 8 | Agregar auto-expand | Baja |
| 9 | Agregar literals i18n | Baja |

---

## Consideraciones

- **No cambiar el server**: los `details` ricos ya se envían, solo falta aprovecharlos en el client
- **Seguir patrón existente**: componentes funcionales, Tailwind v4 tokens, Framer Motion para animaciones, sin comentarios
- **Mobile-first**: los resultados de Exa deben stackear bien en 375px
- **Performance**: Exa puede retornar hasta 25 resultados; paginar virtualmente con "Show N more" a partir de 5
- **Synthesized output**: cuando `type` es `deep` o `deep-reasoning`, Exa retorna un `synthesizedOutput` que merece su propia sección collapsible
