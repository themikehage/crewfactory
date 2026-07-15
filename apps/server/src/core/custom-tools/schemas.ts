import { z } from "zod";

// --- Tier 1 Base Schemas ---
export const BadgeSchema = z.object({
  type: z.literal("badge"),
  text: z.string(),
  variant: z.enum(["success", "warning", "error", "info", "neutral"]).default("neutral"),
});

export const CardSchema = z.object({
  type: z.literal("card"),
  title: z.string(),
  description: z.string().optional(),
  status: z.enum(["success", "warning", "error", "info"]).optional(),
  action: z.string().optional(),
  metadata: z.record(z.string()).optional(),
});

export const TableSchema = z.object({
  type: z.literal("table"),
  title: z.string().optional(),
  columns: z.array(z.string()),
  rows: z.array(z.record(z.any())),
  striped: z.boolean().default(true),
});

export const MetricSchema = z.object({
  type: z.literal("metric"),
  label: z.string(),
  value: z.string(),
  trend: z.enum(["up", "down", "neutral"]).optional(),
  subtitle: z.string().optional(),
});

export const CodeSchema = z.object({
  type: z.literal("code"),
  code: z.string(),
  language: z.string().optional(),
  title: z.string().optional(),
});

export const HtmlSchema = z.object({
  type: z.literal("html"),
  html: z.string(),
  title: z.string().optional(),
  height: z.string().optional().default("70vh"),
});

// --- Tier 2 Media Schemas ---
export const VideoSchema = z.object({
  type: z.literal("video"),
  src: z.string(),
  poster: z.string().optional(),
  title: z.string().optional(),
  autoplay: z.boolean().default(false),
  muted: z.boolean().default(true),
  controls: z.boolean().default(true),
});

export const AudioSchema = z.object({
  type: z.literal("audio"),
  src: z.string(),
  title: z.string().optional(),
  artist: z.string().optional(),
  coverImage: z.string().optional(),
});

export const PdfSchema = z.object({
  type: z.literal("pdf"),
  src: z.string(),
  title: z.string().optional(),
  page: z.number().min(1).optional(),
  scale: z.number().min(0.5).max(3).optional(),
});

// --- Tier 3 High-Demand Schemas ---
export const MarkdownSchema = z.object({
  type: z.literal("markdown"),
  content: z.string(),
  title: z.string().optional(),
});

export const ProgressSchema = z.object({
  type: z.literal("progress"),
  value: z.number().min(0).max(100),
  label: z.string().optional(),
  variant: z.enum(["bar", "circle"]).default("bar"),
  showPercentage: z.boolean().default(true),
});

export const DiffSchema = z.object({
  type: z.literal("diff"),
  oldCode: z.string(),
  newCode: z.string(),
  language: z.string().optional(),
  title: z.string().optional(),
});

export const StepsSchema = z.object({
  type: z.literal("steps"),
  steps: z.array(
    z.object({
      label: z.string(),
      status: z.enum(["done", "active", "pending", "error"]),
      description: z.string().optional(),
    })
  ),
  direction: z.enum(["horizontal", "vertical"]).default("vertical"),
});

export const StatsSchema = z.object({
  type: z.literal("stats"),
  stats: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      change: z.string().optional(),
      trend: z.enum(["up", "down", "neutral"]).optional(),
    })
  ),
  title: z.string().optional(),
  columns: z.number().min(1).max(4).default(3),
});

export const TimelineSchema = z.object({
  type: z.literal("timeline"),
  items: z.array(
    z.object({
      date: z.string().optional(),
      title: z.string(),
      description: z.string().optional(),
      status: z.enum(["success", "warning", "error", "info"]).optional(),
    })
  ),
  title: z.string().optional(),
});

// --- Recursive Schemas (Lazy reference) ---
export const SectionSchema = z.object({
  type: z.literal("section"),
  title: z.string(),
  children: z.array(z.lazy(() => UiComponentSchema)),
});

export const TabsSchema = z.object({
  type: z.literal("tabs"),
  tabs: z.array(
    z.object({
      label: z.string(),
      content: z.array(z.lazy(() => UiComponentSchema)),
    })
  ),
  defaultTab: z.number().min(0).default(0),
});

export const AccordionSchema = z.object({
  type: z.literal("accordion"),
  items: z.array(
    z.object({
      title: z.string(),
      content: z.array(z.lazy(() => UiComponentSchema)),
      defaultOpen: z.boolean().default(true),
    })
  ),
});

export const CardListSchema = z.object({
  type: z.literal("card-list"),
  title: z.string().optional(),
  cards: z.array(CardSchema),
  columns: z.number().min(1).max(4).default(2),
});

// --- Unified UI Component Schema ---
export const UiComponentSchema: z.ZodType<any> = z.lazy(() =>
  z.discriminatedUnion("type", [
    BadgeSchema,
    CardSchema,
    CardListSchema,
    TableSchema,
    MetricSchema,
    CodeSchema,
    SectionSchema,
    HtmlSchema,
    VideoSchema,
    AudioSchema,
    PdfSchema,
    TabsSchema,
    MarkdownSchema,
    ProgressSchema,
    AccordionSchema,
    DiffSchema,
    StepsSchema,
    StatsSchema,
    TimelineSchema,
  ])
);

// --- Execution Mode Schemas ---
export const PipelineStepSchema = z.object({
  tool: z.enum(["bash", "read", "write", "edit", "grep", "find", "ls"]),
  params: z.record(z.any()),
  output: z.string().optional().describe("Variable name to capture the result text"),
  description: z.string().optional().describe("Human-readable label shown during execution"),
});

export const ExecutionPipelineSchema = z.object({
  type: z.literal("pipeline"),
  steps: z.array(PipelineStepSchema).min(1),
  onError: z.enum(["stop", "continue"]).default("stop"),
});

export const ExecutionUiSchema = z.object({
  type: z.literal("ui"),
});

export const ExecutionModeSchema = z.discriminatedUnion("type", [
  ExecutionPipelineSchema,
  ExecutionUiSchema,
]);

// --- Presentation / Display Options ---
export const PresentationSchema = z.object({
  defaultExpanded: z.boolean().default(true).describe("Whether the tool result container is expanded by default in chat"),
  accordionDefaultOpen: z.boolean().default(true).describe("Default open state for accordion items when not specified per item"),
});

export type PresentationOptions = z.infer<typeof PresentationSchema>;

// --- Main Custom Tool Definition Schema ---
export const JSONSchemaLiteral = z.object({
  type: z.literal("object"),
  properties: z.record(z.any()),
  required: z.array(z.string()).optional(),
});

export const ToolScopeTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("global") }),
  z.object({ type: z.literal("channel"), id: z.string() }),
  z.object({ type: z.literal("project"), id: z.string() }),
  z.object({ type: z.literal("agent"), id: z.string() }),
]);
export type ToolScopeTarget = z.infer<typeof ToolScopeTargetSchema>;

export const CustomToolDefinitionSchema = z.object({
  name: z.string()
    .regex(/^[a-z][a-z0-9_]+$/, "Must be snake_case, lowercase letters/numbers/underscores")
    .max(64),
  label: z.string().max(64).optional(),
  description: z.string().min(10).max(500),
  parameters: JSONSchemaLiteral,
  execute: ExecutionModeSchema,
  ui: z.union([UiComponentSchema, z.array(UiComponentSchema)]).optional(),
  presentation: PresentationSchema.optional().describe("UI presentation preferences for how the tool appears in chat"),
  enabled: z.boolean().default(true),
  scope: ToolScopeTargetSchema.optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type CustomToolDefinition = z.infer<typeof CustomToolDefinitionSchema>;
export type UiComponent = z.infer<typeof UiComponentSchema>;
export type ExecutionPipeline = z.infer<typeof ExecutionPipelineSchema>;
export type PipelineStep = z.infer<typeof PipelineStepSchema>;
