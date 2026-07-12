# Custom Tool System - Design & Implementation Plan

## Overview

El sistema de **Custom Tools** permite al agente LLM crear, a demanda, herramientas personalizadas con tres modos de ejecucion (pipeline, UI-only, subagent) y un motor de 19 componentes UI estructurados en 3 tiers (Base, Media, High-demand) que se renderizan nativamente con el design system de la aplicacion.

### Arquitectura en 3 capas

```
┌──────────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                           │
│  ┌──────────────┐  ┌──────────────────────────────────────┐  │
│  │ ToolCallRow   │  │  CustomUiRenderer (19 components)    │  │
│  │ (case         │──│  ┌──────────┐ ┌──────────┐         │  │
│  │  custom_tool) │  │  │CardList   │ │Table     │ T1 Base │  │
│  │               │  │  │Metric     │ │Code      │   (8)   │  │
│  │               │  │  │Badge      │ │Section   │         │  │
│  │               │  │  │Html+DS    │ │Card      │         │  │
│  │               │  │  ├──────────┤ └──────────┘         │  │
│  │               │  │  │Video      │ │Audio     │ T2 Media│  │
│  │               │  │  │Pdf       │ │          │   (3)   │  │
│  │               │  │  ├──────────┤ └──────────┘         │  │
│  │               │  │  │Tabs       │ │Accordion │ T3 High │  │
│  │               │  │  │Progress   │ │Markdown  │   (8)   │  │
│  │               │  │  │Diff       │ │Steps     │         │  │
│  │               │  │  │Stats      │ │Timeline  │         │  │
│  │               │  │  └──────────┘ └──────────┘         │  │
│  └──────────────┘  └──────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────┤
│                    SERVER (Bun + Hono)                   │
│  ┌────────────────────┐  ┌───────────────────────────┐  │
│  │ manage_custom_tools │  │  CustomToolStorage        │  │
│  │ (CRUD tool)         │  │  (filesystem persistence) │  │
│  └────────────────────┘  └───────────────────────────┘  │
│  ┌────────────────────┐  ┌───────────────────────────┐  │
│  │ PipelineEngine      │  │  CustomToolRuntime        │  │
│  │ (step execution)    │  │  (wraps def → AgentTool)  │  │
│  └────────────────────┘  └───────────────────────────┘  │
│  ┌────────────────────┐  ┌───────────────────────────┐  │
│  │ CustomToolSchemas   │  │  PromptInjection           │  │
│  │ (Zod validation)    │  │  (LLM instructions)        │  │
│  └────────────────────┘  └───────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│                 PERSISTENCE (filesystem)                  │
│  /app/data/users/{username}/custom-tools/               │
│    {toolName}.json         ← CustomToolDefinition       │
│    _index.json             ← Registry index             │
└─────────────────────────────────────────────────────────┘
```

---

## Part 1: Tool Contract (Zod Schema)

### Archivo: `apps/server/src/core/custom-tools/schemas.ts`

Define el contrato completo que el agente debe cumplir al crear una tool. Validado con Zod.

```typescript
import { z } from "zod";

// --- Pipeline Step ---
const PipelineStepSchema = z.object({
  tool: z.enum(["bash", "read", "write", "edit", "grep", "find", "ls"]),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  output: z.string().optional().describe("Variable name to capture the result text"),
  description: z.string().optional().describe("Human-readable label shown during execution"),
});

// --- Execution Modes ---
const ExecutionPipelineSchema = z.object({
  type: z.literal("pipeline"),
  steps: z.array(PipelineStepSchema).min(1),
  onError: z.enum(["stop", "continue"]).default("stop"),
});

const ExecutionUiSchema = z.object({
  type: z.literal("ui"),
});

// Phase 2:
// const ExecutionSubagentSchema = z.object({
//   type: z.literal("subagent"),
//   instruction: z.string().min(1),
// });

const ExecutionModeSchema = z.discriminatedUnion("type", [
  ExecutionPipelineSchema,
  ExecutionUiSchema,
  // ExecutionSubagentSchema,
]);

// --- Structured UI Components ---
const BadgeSchema = z.object({
  type: z.literal("badge"),
  text: z.string(),
  variant: z.enum(["success", "warning", "error", "info", "neutral"]).default("neutral"),
});

const CardSchema = z.object({
  type: z.literal("card"),
  title: z.string(),
  description: z.string().optional(),
  status: z.enum(["success", "warning", "error", "info"]).optional(),
  action: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

const CardListSchema = z.object({
  type: z.literal("card-list"),
  title: z.string().optional(),
  cards: z.array(CardSchema),
  columns: z.number().min(1).max(4).default(2).describe("Number of columns in the grid"),
});

const TableSchema = z.object({
  type: z.literal("table"),
  title: z.string().optional(),
  columns: z.array(z.string()),
  rows: z.array(z.record(z.string(), z.string())),
  striped: z.boolean().default(true),
});

const MetricSchema = z.object({
  type: z.literal("metric"),
  label: z.string(),
  value: z.string(),
  trend: z.enum(["up", "down", "neutral"]).optional(),
  subtitle: z.string().optional(),
});

const CodeSchema = z.object({
  type: z.literal("code"),
  code: z.string(),
  language: z.string().optional(),
  title: z.string().optional(),
});

const SectionSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    type: z.literal("section"),
    title: z.string(),
    children: z.array(UiComponentSchema),
  })
);

const HtmlSchema = z.object({
  type: z.literal("html"),
  html: z.string(),
  title: z.string().optional(),
  height: z.string().optional().describe("CSS height value. Default: '70vh'"),
});

// --- Media Components (Tier 2) ---

const VideoSchema = z.object({
  type: z.literal("video"),
  src: z.string(),
  poster: z.string().optional(),
  title: z.string().optional(),
  autoplay: z.boolean().default(false),
  muted: z.boolean().default(true),
  controls: z.boolean().default(true),
});

const AudioSchema = z.object({
  type: z.literal("audio"),
  src: z.string(),
  title: z.string().optional(),
  artist: z.string().optional(),
  coverImage: z.string().optional(),
});

const PdfSchema = z.object({
  type: z.literal("pdf"),
  src: z.string(),
  title: z.string().optional(),
  page: z.number().min(1).optional(),
  scale: z.number().min(0.5).max(3).optional(),
});

// --- High-Demand Components (Tier 3) ---

const TabsSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    type: z.literal("tabs"),
    tabs: z.array(z.object({
      label: z.string(),
      content: z.array(UiComponentSchema),
    })),
    defaultTab: z.number().min(0).default(0),
  })
);

const MarkdownSchema = z.object({
  type: z.literal("markdown"),
  content: z.string(),
  title: z.string().optional(),
});

const ProgressSchema = z.object({
  type: z.literal("progress"),
  value: z.number().min(0).max(100),
  label: z.string().optional(),
  variant: z.enum(["bar", "circle"]).default("bar"),
  showPercentage: z.boolean().default(true),
});

const AccordionSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    type: z.literal("accordion"),
    items: z.array(z.object({
      title: z.string(),
      content: z.array(UiComponentSchema),
      defaultOpen: z.boolean().default(false),
    })),
  })
);

const DiffSchema = z.object({
  type: z.literal("diff"),
  oldCode: z.string(),
  newCode: z.string(),
  language: z.string().optional(),
  title: z.string().optional(),
});

const StepsSchema = z.object({
  type: z.literal("steps"),
  steps: z.array(z.object({
    label: z.string(),
    status: z.enum(["done", "active", "pending", "error"]),
    description: z.string().optional(),
  })),
  direction: z.enum(["horizontal", "vertical"]).default("vertical"),
});

const StatsSchema = z.object({
  type: z.literal("stats"),
  stats: z.array(z.object({
    label: z.string(),
    value: z.string(),
    change: z.string().optional(),
    trend: z.enum(["up", "down", "neutral"]).optional(),
  })),
  title: z.string().optional(),
  columns: z.number().min(1).max(4).default(3),
});

const TimelineSchema = z.object({
  type: z.literal("timeline"),
  items: z.array(z.object({
    date: z.string().optional(),
    title: z.string(),
    description: z.string().optional(),
    status: z.enum(["success", "warning", "error", "info"]).optional(),
  })),
  title: z.string().optional(),
});

const UiComponentSchema = z.discriminatedUnion("type", [
  // Tier 1 — Base
  BadgeSchema, CardSchema, CardListSchema, TableSchema,
  MetricSchema, CodeSchema, SectionSchema, HtmlSchema,
  // Tier 2 — Media
  VideoSchema, AudioSchema, PdfSchema,
  // Tier 3 — High-demand
  TabsSchema, MarkdownSchema, ProgressSchema, AccordionSchema,
  DiffSchema, StepsSchema, StatsSchema, TimelineSchema,
]);

// --- CustomToolDefinition ---
const JSONSchemaLiteral = z.object({
  type: z.literal("object"),
  properties: z.record(z.string(), z.any()),
  required: z.array(z.string()).optional(),
});

export const CustomToolDefinitionSchema = z.object({
  name: z.string()
    .regex(/^[a-z][a-z0-9_]+$/, "Must be snake_case, lowercase letters/numbers/underscores")
    .max(64),
  label: z.string().max(64).optional(),
  description: z.string().min(10).max(500),
  parameters: JSONSchemaLiteral,
  execute: ExecutionModeSchema,
  ui: z.union([UiComponentSchema, z.array(UiComponentSchema)]).optional(),
  enabled: z.boolean().default(true),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type CustomToolDefinition = z.infer<typeof CustomToolDefinitionSchema>;
export type UiComponent = z.infer<typeof UiComponentSchema>;
export type ExecutionPipeline = z.infer<typeof ExecutionPipelineSchema>;
export type PipelineStep = z.infer<typeof PipelineStepSchema>;
```

### Diseno del Contrato para el AGENTS.md del LLM

El agente recibira en su system prompt instrucciones precisas sobre como construir este objeto. El key design decision: el parametro `execute` permite al agente elegir entre:

- **`pipeline`**: Secuencia de tools existentes con paso de variables entre pasos (conectar bash→read→render). Variables referenciadas via `{variableName}`.
- **`ui`**: La tool es puramente visual. El `ui` block contiene los componentes estructurados. El frontend renderiza nativamente.
- **`subagent`**: (fase 2) La tool spawnca un subagente con instrucciones especificas.

El `ui` block soporta composicion anidada: por ejemplo `section` contiene `card-list` que contiene `card` + `badge`. Y `html` es el escape hatch con design system inyectado.

---

## Part 2: Pipeline Engine (Execution)

### Archivo: `apps/server/src/core/custom-tools/pipeline-engine.ts`

Motor que ejecuta secuencialmente los pasos del pipeline, resolviendo referencias a variables.

```typescript
interface PipelineContext {
  cwd: string;
  session: AgentSession;       // Acceso a las tools del session para ejecutar steps
  username: string;
  sessionId: string;
}

interface VariableScope {
  [key: string]: string;
}

async function executePipeline(
  steps: PipelineStep[],
  toolParams: Record<string, any>,
  context: PipelineContext,
  signal?: AbortSignal,
  onProgress?: (step: number, total: number, description: string) => void
): Promise<AgentToolResult>
```

**Flujo de ejecucion:**

```
1. Inicializar scope con toolParams (los parametros que el LLM paso al invocar la custom tool)
2. Para cada step:
   a. Resolver variables: reemplazar {varName} en params con valor del scope
   b. Buscar la tool en session.tools
   c. Ejecutar tool(fakeToolCallId, resolvedParams, signal)
   d. Si step.output: guardar result.content[0].text en scope[step.output]
   e. Si onError === "stop" y falla: detener pipeline, retornar error
   f. Si onError === "continue" y falla: registrar warning, seguir
3. Retornar AgentToolResult con ultimo step output como content + full log como details
```

**Resolucion de variables:**

```typescript
function resolveVariables(template: unknown, scope: VariableScope): unknown {
  if (typeof template === "string") {
    return template.replace(/\{(\w+)\}/g, (_, key) => scope[key] ?? `{${key}}`);
  }
  if (typeof template === "object" && template !== null) {
    for (const [k, v] of Object.entries(template)) {
      template[k] = resolveVariables(v, scope);
    }
  }
  return template;
}
```

**Eventos WS durante pipeline execution:**

- `tool_execution_start` → indica el nombre de la custom tool + step actual
- `tool_execution_update` → emite el partial result del step actual (lo muestra como "running step X/Y: description")
- `tool_execution_end` → resultado final compuesto

---

## Part 3: State Management Engine (CRUD)

### Archivo: `apps/server/src/core/custom-tools/storage.ts`

Persistencia en filesystem, igual que los SKILL.md files:

```
/app/data/users/{username}/custom-tools/
  _index.json          ← Array of { name, label, enabled, createdAt }
  {toolName}.json      ← CustomToolDefinition completo
```

```typescript
interface CustomToolStorage {
  loadAll(username: string): CustomToolDefinition[];
  get(username: string, name: string): CustomToolDefinition | null;
  upsert(username: string, definition: CustomToolDefinition): void;
  delete(username: string, name: string): void;
  toggle(username: string, name: string, enabled: boolean): void;
  resolveActiveTools(username: string, session: AgentSession): AgentTool[];
}
```

### Archivo: `apps/server/src/core/custom-tools/manage-custom-tools-tool.ts`

Tool `manage_custom_tools` con CRUD, usando el patron de `factory-tool.ts`:

```
manage_custom_tools(action: "get" | "upsert" | "delete" | "toggle", tool?: CustomToolDefinition, name?: string)
```

- **get**: Lista todas las custom tools del usuario (o una especifica por name)
- **upsert**: Valida con Zod, persiste, inyecta en la sesion actual via `_customTools.push()` + `_refreshToolRegistry()`, emite `entity-updated`
- **delete**: Elimina del filesystem, remueve de la sesion
- **toggle**: Activa/desactiva sin borrar. Las desactivadas no se inyectan en la sesion

### Archivo: `apps/server/src/core/custom-tools/runtime.ts`

Convierte `CustomToolDefinition` → `AgentTool` compatible con el AgentSession:

```typescript
function createCustomToolRuntime(
  definition: CustomToolDefinition,
  context: PipelineContext
): AgentTool {
  return {
    name: definition.name,
    label: definition.label || definition.name,
    description: definition.description,
    parameters: definition.parameters as any,
    execute: async (toolCallId, params, signal, onUpdate) => {
      switch (definition.execute.type) {
        case "pipeline":
          return executePipeline(
            definition.execute.steps,
            params,
            context,
            signal,
            (step, total, desc) => onUpdate?.({ content: [{ type: "text", text: `Step ${step}/${total}: ${desc}` }], details: { step, total } })
          );
        case "ui":
          return { content: [{ type: "text", text: `UI rendered for ${definition.name}` }], details: { ui: definition.ui } };
        // Phase 2:
        // case "subagent":
        //   return executeSubagent(definition.execute.instruction, params, context);
      }
    },
  };
}
```

---

## Part 4: Integration into Session & Tool Registry

### Modificaciones en `tool-factory.ts`

```typescript
// En SessionToolFactory.createSessionTools():
import { createCustomToolStorage } from "../custom-tools/storage";
import { createCustomToolRuntime } from "../custom-tools/runtime";

const storage = createCustomToolStorage();
const activeDefs = storage.loadAll(username).filter(d => d.enabled);
const customToolDefs = activeDefs.map(def =>
  createCustomToolRuntime(def, { cwd: workspaceDir, session, username, sessionId })
);

const customTools = [
  ...otherTools,
  ...customToolDefs,           // <-- inyectar aqui
];
```

### Modificaciones en `session-manager.ts`

Despues de `setActiveToolsByName()`, cargar tambien las custom tools activas:

```typescript
// En getOrCreateSession():
const activeTools = [...alwaysOnTools, ...persistedTools];  // existing
activeTools.push(...storage.loadAll(username).filter(d => d.enabled).map(d => d.name));
session.setActiveToolsByName(activeTools);
```

### Entity Refresh

Agregar `custom-tools: "custom_tool"` a `ENTITY_REFRESH_MAP` en `factory-tool.ts`. Al crear/editar/eliminar una custom tool, broadcast `entity-updated` para que el frontend refresque.

---

## Part 5: UI Component Builder (Frontend)

### Archivos nuevos en `apps/client/src/components/chat/tools/custom/`

Cada componente sigue el patron Tailwind del proyecto (tokens: `bg-surface`, `text-accent`, `border-border`, `font-outfit`, etc.):

| Archivo | Proposito |
|---------|-----------|
| `CustomToolBody.tsx` | Dispatcher principal: lee `ui` de los args del toolCall y renderiza. Es la entrada al sistema de UI. |
| `CustomUiRenderer.tsx` | Factory que recibe un `UiComponent` (o `UiComponent[]`) y monta una cadena de secciones+componentes |
| **Tier 1 — Base** | |
| `CardComponent.tsx` | Renderiza `{ type: "card" }` — card individual con titulo, descripcion, status, metadatos |
| `CardListComponent.tsx` | Renderiza `{ type: "card-list" }` — grid responsive de cards con titulo de seccion |
| `TableComponent.tsx` | Renderiza `{ type: "table" }` — tabla con columnas, filas, alternancia de color |
| `BadgeComponent.tsx` | Renderiza `{ type: "badge" }` — pill/etiqueta con color segun variant |
| `MetricComponent.tsx` | Renderiza `{ type: "metric" }` — numero grande + label + trend arrow |
| `CodeComponent.tsx` | Renderiza `{ type: "code" }` — bloque de codigo con syntax highlight via CSS |
| `SectionComponent.tsx` | Renderiza `{ type: "section" }` — wrapper con titulo que contiene children recursivos |
| `CustomHtmlComponent.tsx` | Renderiza `{ type: "html" }` — recicla `HtmlPreview` con design system inyectado |
| **Tier 2 — Media** | |
| `VideoComponent.tsx` | Renderiza `{ type: "video" }` — reproductor HTML5 con theme oscuro, poster, autoplay |
| `AudioComponent.tsx` | Renderiza `{ type: "audio" }` — mini-player con waveform CSS, cover art, controls |
| `PdfComponent.tsx` | Renderiza `{ type: "pdf" }` — visor iframe autenticado con toolbar (paginas, zoom, descarga) |
| **Tier 3 — High-demand** | |
| `TabsComponent.tsx` | Renderiza `{ type: "tabs" }` — tabbed container con children por pestaña |
| `MarkdownComponent.tsx` | Renderiza `{ type: "markdown" }` — texto rico con titulo opcional, tipografia del theme |
| `ProgressComponent.tsx` | Renderiza `{ type: "progress" }` — barra (linear) o circulo con label y porcentaje |
| `AccordionComponent.tsx` | Renderiza `{ type: "accordion" }` — items colapsables con children anidados |
| `DiffComponent.tsx` | Renderiza `{ type: "diff" }` — side-by-side code diff con colores de insercion/delecion |
| `StepsComponent.tsx` | Renderiza `{ type: "steps" }` — timeline vertical/horizontal con estados |
| `StatsComponent.tsx` | Renderiza `{ type: "stats" }` — grid de KPI cards estilo dashboard |
| `TimelineComponent.tsx` | Renderiza `{ type: "timeline" }` — linea temporal con fechas, titulos y estados |

### `CustomUiRenderer.tsx` — El corazon del UI Builder

```typescript
interface Props {
  ui: UiComponent | UiComponent[] | undefined;
  designTokens: string;  // Tailwind theme CSS inyectado como string para HTML
}

function CustomUiRenderer({ ui, designTokens }: Props) {
  if (!ui) return null;
  const components = Array.isArray(ui) ? ui : [ui];

  return (
    <div className="flex flex-col gap-4 py-2">
      {components.map((comp, i) => renderComponent(comp, i, designTokens))}
    </div>
  );
}

function renderComponent(comp: UiComponent, key: number, tokens: string): ReactNode {
  switch (comp.type) {
    // Tier 1 — Base
    case "badge":      return <BadgeComponent key={key} {...comp} />;
    case "card":       return <CardComponent key={key} {...comp} />;
    case "card-list":  return <CardListComponent key={key} {...comp} />;
    case "table":      return <TableComponent key={key} {...comp} />;
    case "metric":     return <MetricComponent key={key} {...comp} />;
    case "code":       return <CodeComponent key={key} {...comp} />;
    case "section":    return <SectionComponent key={key} {...comp} tokens={tokens} />;
    case "html":       return <CustomHtmlComponent key={key} {...comp} tokens={tokens} />;
    // Tier 2 — Media
    case "video":      return <VideoComponent key={key} {...comp} />;
    case "audio":      return <AudioComponent key={key} {...comp} />;
    case "pdf":        return <PdfComponent key={key} {...comp} />;
    // Tier 3 — High-demand
    case "tabs":       return <TabsComponent key={key} {...comp} tokens={tokens} />;
    case "markdown":   return <MarkdownComponent key={key} {...comp} />;
    case "progress":   return <ProgressComponent key={key} {...comp} />;
    case "accordion":  return <AccordionComponent key={key} {...comp} tokens={tokens} />;
    case "diff":       return <DiffComponent key={key} {...comp} />;
    case "steps":      return <StepsComponent key={key} {...comp} />;
    case "stats":      return <StatsComponent key={key} {...comp} />;
    case "timeline":   return <TimelineComponent key={key} {...comp} />;
  }
}
```

### Modificaciones en `ToolCallRow.tsx`

Anadir al switch de `ToolBody`:

```typescript
// En TOOL_META:
TOOL_META["custom_tool"] = {
  label: "custom",
  colorClass: "text-primary",
  icon: <PuzzleIcon />,
};

// En ToolBody switch:
case "custom_tool": {
  const uiDef = (result?.details as any)?.ui || (args as any).ui;
  return <CustomUiRenderer
    ui={uiDef}
    designTokens={CUSTOM_TOOL_THEME_CSS}
  />;
}
```

### `Case "custom_tool":` con HTML Escape Hatch

Cuando `ui` contiene un componente `{ type: "html", ... }`, el `CustomHtmlComponent` wrappea el `HtmlPreview` existente pero inyecta los tokens del design system de Tailwind en el `<style>` del documento HTML:

```typescript
function CustomHtmlComponent({ html, title, height, tokens }: HtmlComponent & { tokens: string }) {
  const wrappedHtml = html.replace(
    "</head>",
    `<style>${tokens}</style></head>`
  );
  return <HtmlPreview html={wrappedHtml} title={title} fullBleed />;
}
```

---

## Part 6: Design System Injection for HTML

### Archivo: `apps/client/src/components/chat/tools/custom/design-tokens.ts`

Extrae los tokens del tema como CSS para inyectar en iframes HTML de custom tools:

```typescript
export const CUSTOM_TOOL_THEME_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Outfit', sans-serif;
    background: #121212;
    color: #e2e8f0;
    padding: 1rem;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  :root {
    --bg: #121212;
    --surface: #171717;
    --surface-hover: #313131;
    --accent: #4ade80;
    --text-primary: #e2e8f0;
    --text-secondary: #a2a2a2;
    --success: #4ade80;
    --warning: #fbbf24;
    --error: #ca3214;
    --border: #2a2a2a;
  }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
  .card-title { color: var(--text-primary); font-size: 14px; font-weight: 600; }
  .card-desc { color: var(--text-secondary); font-size: 12px; margin-top: 4px; }
  .badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; }
  .badge-success { background: color-mix(in srgb, var(--success) 15%, transparent); color: var(--success); }
  .badge-warning { background: color-mix(in srgb, var(--warning) 15%, transparent); color: var(--warning); }
  .badge-error { background: color-mix(in srgb, var(--error) 15%, transparent); color: var(--error); }
  .badge-info { background: color-mix(in srgb, #60a5fa 15%, transparent); color: #60a5fa; }
  .badge-neutral { background: color-mix(in srgb, var(--text-secondary) 15%, transparent); color: var(--text-secondary); }
  .table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .table th { text-align: left; color: var(--text-secondary); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; padding: 8px 12px; border-bottom: 1px solid var(--border); }
  .table td { padding: 8px 12px; color: var(--text-primary); border-bottom: 1px solid var(--border); }
  .table tr.striped:nth-child(even) { background: color-mix(in srgb, var(--surface-hover) 50%, transparent); }
  .metric-value { font-size: 32px; font-weight: 700; color: var(--accent); }
  .metric-label { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
  pre.code { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px; font-family: 'JetBrains Mono', monospace; font-size: 12px; overflow-x: auto; }
  .section-title { color: var(--text-secondary); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
  .section { padding: 12px 0; }
  .tabs-header { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 12px; }
  .tab-btn { padding: 8px 16px; font-size: 13px; font-weight: 500; color: var(--text-secondary); background: none; border: none; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.15s; }
  .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
  .markdown-content { line-height: 1.7; }
  .markdown-content h1,.markdown-content h2,.markdown-content h3 { color: var(--text-primary); margin: 16px 0 8px; }
  .markdown-content p { margin: 8px 0; }
  .markdown-content code { background: var(--surface); padding: 2px 6px; border-radius: 4px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--accent); }
  .progress-bar { background: var(--surface); border-radius: 6px; height: 8px; overflow: hidden; }
  .progress-fill { background: var(--accent); height: 100%; border-radius: 6px; transition: width 0.4s ease; }
  .progress-label { font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; display: flex; justify-content: space-between; }
  .accordion-item { border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px; overflow: hidden; }
  .accordion-header { padding: 12px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 600; color: var(--text-primary); }
  .accordion-body { padding: 0 12px 12px; }
  .diff-container { display: grid; grid-template-columns: 1fr 1fr; gap: 0; font-family: 'JetBrains Mono', monospace; font-size: 12px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .diff-pane { overflow-x: auto; }
  .diff-header { padding: 6px 12px; font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; }
  .diff-line { padding: 2px 12px; white-space: pre; }
  .diff-add { background: color-mix(in srgb, var(--success) 15%, transparent); color: var(--success); }
  .diff-remove { background: color-mix(in srgb, var(--error) 15%, transparent); color: var(--error); }
  .steps-list { position: relative; padding-left: 24px; }
  .steps-list::before { content: ''; position: absolute; left: 8px; top: 0; bottom: 0; width: 2px; background: var(--border); }
  .step-item { position: relative; padding-bottom: 16px; }
  .step-dot { position: absolute; left: -16px; top: 2px; width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--border); }
  .step-dot.done { background: var(--success); border-color: var(--success); }
  .step-dot.active { background: var(--accent); border-color: var(--accent); }
  .step-dot.error { background: var(--error); border-color: var(--error); }
  .step-label { font-size: 13px; font-weight: 600; color: var(--text-primary); }
  .step-desc { font-size: 11px; color: var(--text-secondary); margin-top: 2px; }
  .stats-grid { display: grid; gap: 12px; }
  .stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px; }
  .stat-label { font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.03em; }
  .stat-value { font-size: 24px; font-weight: 700; color: var(--text-primary); margin-top: 4px; }
  .stat-change { font-size: 12px; margin-top: 4px; display: inline-flex; align-items: center; gap: 4px; }
  .timeline-list { position: relative; padding-left: 24px; }
  .timeline-list::before { content: ''; position: absolute; left: 8px; top: 0; bottom: 0; width: 2px; background: var(--border); }
  .timeline-item { position: relative; padding-bottom: 16px; }
  .timeline-dot { position: absolute; left: -16px; top: 2px; width: 12px; height: 12px; border-radius: 50%; }
  .timeline-dot.success { background: var(--success); }
  .timeline-dot.warning { background: var(--warning); }
  .timeline-dot.error { background: var(--error); }
  .timeline-date { font-size: 11px; color: var(--text-secondary); }
  .timeline-title { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-top: 2px; }
  .timeline-desc { font-size: 11px; color: var(--text-secondary); margin-top: 2px; }
  .audio-player { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px; display: flex; align-items: center; gap: 12px; }
  .audio-cover { width: 48px; height: 48px; border-radius: 6px; background: var(--border); flex-shrink: 0; }
  .audio-info { flex: 1; min-width: 0; }
  .audio-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
  .audio-artist { font-size: 11px; color: var(--text-secondary); }
  .audio-waveform { height: 32px; background: var(--accent); opacity: 0.3; border-radius: 4px; }
  .video-wrapper { position: relative; background: #000; border-radius: 8px; overflow: hidden; }
  .video-wrapper video { width: 100%; display: block; }
`;
```

Esto es solo para el escape hatch de HTML. Los componentes React nativos (card, table, etc.) usan Tailwind directamente y heredan el diseno automaticamente.

---

## Part 7: Agent System Prompt Injection

### Archivo: `apps/server/src/core/custom-tools/custom-tool-instructions.ts`

Exporta un bloque de texto que se inyecta en el system prompt del agente con instrucciones precisas:

```
## Custom Tool Builder

You have access to a `manage_custom_tools` tool that lets you create, update, delete, and manage custom tools on demand.

### When to Create a Custom Tool

Create a custom tool when:
1. You need to execute a multi-step workflow repeatedly (pipeline mode)
2. You want to display structured data to the user as cards, tables, or metrics (UI mode)
3. The task requires combining several existing tools into a single reusable operation

### Tool Definition Contract

The tool accepts the following JSON structure:

{
  "name": "snake_case_name",        // Required: unique identifier, snake_case
  "label": "Human Readable Name",   // Optional: UI display name
  "description": "Detailed description of what this tool does, when to use it, and what it returns.", // Required, 10-500 chars
  "parameters": {                   // Required: JSON Schema for inputs
    "type": "object",
    "properties": { ... },
    "required": [...]
  },
  "execute": { ... },              // Required: how the tool runs (see below)
  "ui": { ... }                    // Optional: how results look in the UI
}

### Execution Modes

#### Pipeline (type: "pipeline")
Execute a sequence of existing tools. Each step can reference variables using {variableName}.

{
  "type": "pipeline",
  "onError": "stop",
  "steps": [
    {
      "tool": "bash",
      "params": { "command": "find {path} -name '*.ts' | wc -l" },
      "output": "fileCount",
      "description": "Count TypeScript files"
    },
    {
      "tool": "read",
      "params": { "path": "{outputFile}" }
    }
  ]
}

Variables available in params:
- Tool parameters passed by the LLM (e.g., {path}, {outputFile})
- Previous step outputs (e.g., {fileCount} from step above)

Available pipeline tools: bash, read, write, edit, grep, find, ls

#### UI (type: "ui")
Pure rendering tool. No server-side execution. The ui block defines what the user sees.

{
  "type": "ui"
}

### UI Components (22 types in 3 tiers)

**Tier 1 — Base** (always available):

1. **card**: Single information card
   `{ "type": "card", "title": "...", "description": "...", "status": "success|warning|error|info", "metadata": {} }`

2. **card-list**: Grid of cards
   `{ "type": "card-list", "title": "...", "cards": [...cards], "columns": 2 }`

3. **table**: Data table
   `{ "type": "table", "title": "...", "columns": ["Name", "Value"], "rows": [{"Name": "x", "Value": "y"}] }`

4. **badge**: Status indicator
   `{ "type": "badge", "text": "...", "variant": "success|warning|error|info|neutral" }`

5. **metric**: KPI display
   `{ "type": "metric", "label": "...", "value": "...", "trend": "up|down|neutral" }`

6. **code**: Code block with syntax highlight
   `{ "type": "code", "code": "...", "language": "typescript|json|bash|...", "title": "..." }`

7. **section**: Container with title
   `{ "type": "section", "title": "...", "children": [...components] }`

8. **html**: Full HTML document (escape hatch, use sparingly)
   `{ "type": "html", "html": "<!DOCTYPE html>...", "title": "...", "height": "70vh" }`

**Tier 2 — Media** (for generated/uploaded content):

9. **video**: Video player with themed controls
   `{ "type": "video", "src": "path/to/video.mp4", "title": "...", "poster": "...", "autoplay": false }`

10. **audio**: Audio player with waveform-style UI
    `{ "type": "audio", "src": "path/to/audio.mp3", "title": "...", "artist": "...", "coverImage": "..." }`

11. **pdf**: PDF document viewer
    `{ "type": "pdf", "src": "path/to/document.pdf", "title": "...", "page": 1, "scale": 1.0 }`

**Tier 3 — High-demand** (frequently needed):

12. **tabs**: Tabbed content sections
    `{ "type": "tabs", "tabs": [{ "label": "Tab 1", "content": [...components] }], "defaultTab": 0 }`

13. **markdown**: Rich formatted text
    `{ "type": "markdown", "content": "# Heading\n\n**bold** text", "title": "..." }`

14. **progress**: Progress indicator
    `{ "type": "progress", "value": 65, "label": "Building...", "variant": "bar|circle" }`

15. **accordion**: Expandable sections
    `{ "type": "accordion", "items": [{ "title": "FAQ 1", "content": [...components], "defaultOpen": false }] }`

16. **diff**: Side-by-side code comparison
    `{ "type": "diff", "oldCode": "...", "newCode": "...", "language": "typescript", "title": "..." }`

17. **steps**: Process step indicator
    `{ "type": "steps", "steps": [{ "label": "Build", "status": "done", "description": "..." }], "direction": "vertical" }`

18. **stats**: KPI dashboard grid (2-4 columns)
    `{ "type": "stats", "title": "...", "stats": [{ "label": "...", "value": "...", "trend": "up" }], "columns": 3 }`

19. **timeline**: Chronological event list
    `{ "type": "timeline", "title": "...", "items": [{ "date": "2026-01", "title": "...", "status": "success" }] }`

UI components can be nested. Example:
{
  "execute": { "type": "ui" },
  "ui": [
    { "type": "badge", "text": "Analysis Complete", "variant": "success" },
    { "type": "section", "title": "Dependencies", "children": [
      { "type": "card-list", "cards": [...] }
    ]}
  ]
}
```

---

## Implementation Phases

### Phase 1: Foundation (Backend Core)
- [ ] 1.1 Create `apps/server/src/core/custom-tools/` directory
- [ ] 1.2 Implement `schemas.ts` — full Zod schemas for CustomToolDefinition, ExecutionMode, UiComponent
- [ ] 1.3 Implement `storage.ts` — filesystem persistence (loadAll, get, upsert, delete, toggle)
- [ ] 1.4 Implement `pipeline-engine.ts` — sequential step execution with variable resolution
- [ ] 1.5 Implement `runtime.ts` — CustomToolDefinition → AgentTool wrapper with execute dispatch
- [ ] 1.6 Implement `manage-custom-tools-tool.ts` — CRUD tool following factory-tool.ts pattern
- [ ] 1.7 Implement `custom-tool-instructions.ts` — system prompt injection text
- [ ] 1.8 Integrate in `tool-factory.ts` — load active custom tools into session
- [ ] 1.9 Integrate in `session-manager.ts` — include custom tools in setActiveToolsByName
- [ ] 1.10 Add `custom-tools` to `ENTITY_REFRESH_MAP` in factory-tool.ts
- [ ] 1.11 Verify: server compilation, TypeScript strict mode pass
- [ ] 1.12 Unit test: `pipeline-engine.ts` with variable resolution + error scenarios

### Phase 2a: Frontend — Tier 1 Base Components (MVP)
- [ ] 2a.1 Create `apps/client/src/components/chat/tools/custom/` directory
- [ ] 2a.2 Implement `CardComponent.tsx` — card with title, description, status, metadata
- [ ] 2a.3 Implement `CardListComponent.tsx` — responsive grid (1-4 cols)
- [ ] 2a.4 Implement `TableComponent.tsx` — striped table with columns/rows
- [ ] 2a.5 Implement `BadgeComponent.tsx` — colored pill per variant
- [ ] 2a.6 Implement `MetricComponent.tsx` — large value + label + trend indicator
- [ ] 2a.7 Implement `CodeComponent.tsx` — monospace code block with language label
- [ ] 2a.8 Implement `SectionComponent.tsx` — recursive container with title + children
- [ ] 2a.9 Implement `CustomHtmlComponent.tsx` — wraps HtmlPreview with design tokens
- [ ] 2a.10 Implement `design-tokens.ts` — extracted theme CSS for iframe injection
- [ ] 2a.11 Implement `CustomToolBody.tsx` / `CustomUiRenderer.tsx` — main dispatcher
- [ ] 2a.12 Integrate in `ToolCallRow.tsx` — add `custom_tool` case to ToolBody switch
- [ ] 2a.13 Add `custom_tool` to `TOOL_META` with icon
- [ ] 2a.14 Verify: client compilation, TypeScript strict mode pass

### Phase 2b: Frontend — Tier 2 Media Components
- [ ] 2b.1 Implement `VideoComponent.tsx` — HTML5 `<video>` with themed dark controls, poster, title bar, download
- [ ] 2b.2 Implement `AudioComponent.tsx` — mini-player with cover art, artist/title, progress bar, waveform CSS animation
- [ ] 2b.3 Implement `PdfComponent.tsx` — iframe viewer with page/zoom toolbar, download button, open-in-new-tab
- [ ] 2b.4 Update `CustomUiRenderer.tsx` — add video/audio/pdf to switch cases
- [ ] 2b.5 Verify: media sources resolve correctly via workspace/session file API

### Phase 2c: Frontend — Tier 3 High-Demand Components
- [ ] 2c.1 Implement `TabsComponent.tsx` — tab header row + content panels, underline active indicator
- [ ] 2c.2 Implement `MarkdownComponent.tsx` — render markdown content with theme typography
- [ ] 2c.3 Implement `ProgressComponent.tsx` — linear bar + circular variant (SVG ring)
- [ ] 2c.4 Implement `AccordionComponent.tsx` — collapsible items with AnimatePresence, children recursion
- [ ] 2c.5 Implement `DiffComponent.tsx` — side-by-side layout, green/red diff colors, line numbers
- [ ] 2c.6 Implement `StepsComponent.tsx` — vertical/horizontal stepper with icon per state, connector lines
- [ ] 2c.7 Implement `StatsComponent.tsx` — KPI grid (2-4 cols), trend arrows, change indicators
- [ ] 2c.8 Implement `TimelineComponent.tsx` — vertical timeline with date, dot + status color, description
- [ ] 2c.9 Update `CustomUiRenderer.tsx` — add all tier 3 to switch cases
- [ ] 2c.10 Verify: client compilation, TypeScript strict mode pass

### Phase 3: Integration & E2E
- [ ] 3.1 Wire up `manage_custom_tools` tool in `tool-factory.ts` (always-on)
- [ ] 3.2 Wire up `custom_tool` tool in `tool-factory.ts` (each active def gets its own tool)
- [ ] 3.3 Verify `manage_custom_tools` prompts appear in agent system prompt
- [ ] 3.4 E2E test: agent creates a pipeline custom tool, invokes it, pipeline executes
- [ ] 3.5 E2E test: agent creates a UI custom tool, invokes it, frontend renders components
- [ ] 3.6 E2E test: agent creates an HTML custom tool with design system tokens
- [ ] 3.7 E2E test: toggle enable/disable, verify active tools update
- [ ] 3.8 E2E test: delete custom tool, verify removal from session
- [ ] 3.9 Verify `bun run build` passes for both client and server

### Phase 4: Polish (Future)
- [ ] 4.1 Subagent execution mode (type: "subagent")
- [ ] 4.2 Tier 4 specialized components: `comparison`, `calendar`, `map`, `form`, `kanban`, `file-tree`, `rating`, `heatmap`, `carousel`, `toast`
- [ ] 4.3 Pipeline step templates/loops (for repeating operations)
- [ ] 4.4 Custom tool import/export (shareable as JSON files)
- [ ] 4.5 Custom tool marketplace gallery
- [ ] 4.6 Error recovery: retry failed pipeline steps

---

## File Structure Summary

### New files:
```
apps/server/src/core/custom-tools/
  schemas.ts              ← Zod schemas, types
  storage.ts              ← Filesystem CRUD
  pipeline-engine.ts      ← Sequential step executor
  runtime.ts              ← ToolDefinition → AgentTool
  manage-custom-tools-tool.ts  ← CRUD tool for agent
  custom-tool-instructions.ts  ← System prompt text
  index.ts                ← Barrel export

apps/client/src/components/chat/tools/custom/
  CustomToolBody.tsx      ← Entry point, reads ui from args/result
  CustomUiRenderer.tsx    ← Factory dispatcher per component type (switch on type)
  -- Tier 1 — Base --
  CardComponent.tsx       ← { type: "card" }
  CardListComponent.tsx   ← { type: "card-list" }
  TableComponent.tsx      ← { type: "table" }
  BadgeComponent.tsx      ← { type: "badge" }
  MetricComponent.tsx     ← { type: "metric" }
  CodeComponent.tsx       ← { type: "code" }
  SectionComponent.tsx    ← { type: "section" }
  CustomHtmlComponent.tsx ← { type: "html" }
  -- Tier 2 — Media --
  VideoComponent.tsx      ← { type: "video" }
  AudioComponent.tsx      ← { type: "audio" }
  PdfComponent.tsx        ← { type: "pdf" }
  -- Tier 3 — High-demand --
  TabsComponent.tsx       ← { type: "tabs" }
  MarkdownComponent.tsx   ← { type: "markdown" }
  ProgressComponent.tsx   ← { type: "progress" }
  AccordionComponent.tsx  ← { type: "accordion" }
  DiffComponent.tsx       ← { type: "diff" }
  StepsComponent.tsx      ← { type: "steps" }
  StatsComponent.tsx      ← { type: "stats" }
  TimelineComponent.tsx   ← { type: "timeline" }
  -- Shared --
  design-tokens.ts        ← Theme CSS for iframe injection
  index.ts                ← Barrel export
```

### Modified files:
```
apps/server/src/core/session/
  tool-factory.ts         ← Carga custom tools activas, incluye manage_custom_tools
  session-manager.ts      ← Incluye custom tools en setActiveToolsByName
apps/server/src/core/tools/
  factory-tool.ts         ← Agrega custom-tools a ENTITY_REFRESH_MAP
apps/server/src/prompts/
  prompt-builder.ts       ← Inyecta custom-tool-instructions en system prompt
apps/client/src/components/chat/tools/
  ToolCallRow.tsx         ← Case custom_tool en ToolBody, TOOL_META entry
  ToolCallRow.literals.ts ← Literales para custom_tool (en/es)
```

### Persistence:
```
/app/data/users/{username}/custom-tools/
  _index.json             ← Registry: [{ name, label, enabled, createdAt }]
  {toolName}.json         ← CustomToolDefinition completo
```

---

## Example Flow: End-to-End

```
USER: "Crea una tool que analice mi proyecto y me muestre un dashboard"

AGENT  calls manage_custom_tools({
  action: "upsert",
  tool: {
    name: "project_dashboard",
    label: "Project Dashboard",
    description: "Analiza el proyecto actual mostrando metricas de codigo, archivos, y dependencias. Util para tener una vision general rapida del estado del proyecto.",
    parameters: {
      type: "object",
      properties: {
        projectPath: { type: "string", description: "Ruta del proyecto a analizar" }
      },
      required: ["projectPath"]
    },
    execute: {
      type: "pipeline",
      steps: [
        { tool: "bash", params: { command: "find {projectPath} -name '*.ts' | wc -l" }, output: "tsFiles", description: "Count TS files" },
        { tool: "bash", params: { command: "find {projectPath} -name '*.tsx' | wc -l" }, output: "tsxFiles", description: "Count TSX files" },
        { tool: "bash", params: { command: "find {projectPath} -type f -not -path '*/node_modules/*' -not -path '*/.git/*' | wc -l" }, output: "totalFiles", description: "Count total files" }
      ]
    },
    ui: [
      { type: "badge", text: "Dashboard Ready", variant: "success" },
      { type: "section", title: "Code Metrics", children: [
        { type: "metric", label: "TypeScript Files", value: "{tsFiles}" },
        { type: "metric", label: "TSX Files", value: "{tsxFiles}" },
        { type: "metric", label: "Total Files", value: "{totalFiles}" }
      ]}
    ]
  }
})

AGENT: "La tool `project_dashboard` ha sido creada."

AGENT calls project_dashboard({ projectPath: "." })

PIPELINE ENGINE:
  Step 1: bash "find . -name '*.ts' | wc -l" → output: "42"
  Step 2: bash "find . -name '*.tsx' | wc -l" → output: "18"
  Step 3: bash "find . -type f ... | wc -l" → output: "156"

FRONTEND renders:
  [badge] Dashboard Ready
  [section] Code Metrics
    [metric] TypeScript Files → 42
    [metric] TSX Files → 18
    [metric] Total Files → 156
```

---

## Risks & Mitigations

| Riesgo | Mitigacion |
|--------|-----------|
| Agente genera tool definitions invalidas | Zod strict validation en `manage_custom_tools`, rechaza con error descriptivo |
| Pipeline steps fallan silenciosamente | `onError: "stop"` por defecto, cada step registrado en `details`, tool_execution_update con progreso |
| Variables no resueltas (referencia ciclica/ausente) | Resolver deja `{varName}` literal si no existe, visible en output para debugging |
| UI components con data masiva (1000+ cards) | Limitar `cards` a 100, `rows` a 500. Truncar con mensaje |
| HTML injection en custom HTML | Sanitizar via iframe sandbox (ya lo hace HtmlPreview con `sandbox="allow-scripts allow-forms"`) |
| Custom tools que llaman a otras custom tools (recursion) | Pipeline solo permite tools del conjunto fijo (bash, read, write, edit, grep, find, ls). No permite custom tools anidadas |
| Performance al cargar 50+ custom tools | Cargar lazy, solo inyectar en sesion las `enabled: true` |
