import { z } from "zod";

export const LoginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8),
});

export const PromptSchema = z.object({
  message: z.string().min(1),
});

export const SessionStatusSchema = z.enum(["active", "streaming", "task-running", "sleeping"]);

export const SessionSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  messageCount: z.number(),
  status: SessionStatusSchema.optional(),
  projectName: z.string().optional(),
  agentId: z.string().optional(),
  channelId: z.string().optional(),
  experimentId: z.string().optional(),
});

export const CreateSessionSchema = z.object({
  name: z.string().min(1).max(100),
  projectName: z.string().optional(),
  agentId: z.string().optional(),
  channelId: z.string().optional(),
  experimentId: z.string().optional(),
});

export const ModelSettingsSchema = z.object({
  provider: z.string(),
  modelId: z.string(),
  thinkingLevel: z.enum(["off", "minimal", "low", "medium", "high", "xhigh"]),
});

export const AVAILABLE_TOOLS = [
  "read", "write", "edit", "bash", "grep", "find", "ls",
  "request_approval", "ask_question", "render_images", "render_chart", "share_file", "refresh_ui",
  "spawn_subagent", "delegate_task", "exa_search", "decompose_tasks", "update_task_status", "complete_task_list",
  "memory_store", "memory_recall", "memory_forget", "create_experiment", "vision", "generate_image", "manage_factory"
] as const;
export type ToolName = typeof AVAILABLE_TOOLS[number];

export const ToolPermissionsSchema = z.object({
  tools: z.array(z.enum(AVAILABLE_TOOLS)),
});
export type ToolPermissions = z.infer<typeof ToolPermissionsSchema>;

export const SetApiKeySchema = z.object({
  apiKey: z.string().min(1),
});

export const SetEnvVarSchema = z.object({
  key: z.string().min(1).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, "Invalid environment variable name. Must start with a letter or underscore and contain only alphanumeric characters or underscores."),
  value: z.string().min(1),
});

export const TaskStatusSchema = z.enum(["pending", "running", "done", "failed"]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const RunnerStatusSchema = z.enum(["idle", "decomposing", "running", "paused", "completed", "failed"]);
export type RunnerStatus = z.infer<typeof RunnerStatusSchema>;

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  status: TaskStatusSchema,
  log: z.string(),
  depends_on: z.array(z.string()).optional().default([]),
  estimated_steps: z.number().optional(),
});
export type Task = z.infer<typeof TaskSchema>;

export const TaskRunnerStateSchema = z.object({
  tasks: z.array(TaskSchema),
  currentTaskId: z.string().nullable(),
  status: RunnerStatusSchema,
  error: z.string().optional(),
});
export type TaskRunnerState = z.infer<typeof TaskRunnerStateSchema>;

export const QuickActionSchema = z.object({
  id: z.string(),
  name: z.string(),
  prompt: z.string(),
  description: z.string().optional(),
});
export type QuickAction = z.infer<typeof QuickActionSchema>;

export const IntegrationTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  requiredEnvVars: z.array(z.string()),
  requiredProjectVars: z.array(z.string()),
  actions: z.array(QuickActionSchema),
});
export type IntegrationTemplate = z.infer<typeof IntegrationTemplateSchema>;

export const SaveTemplatesSchema = z.object({
  templates: z.array(IntegrationTemplateSchema),
});
export type SaveTemplates = z.infer<typeof SaveTemplatesSchema>;

export const ProjectBindingsSchema = z.record(z.string(), z.record(z.string(), z.string()));
export type ProjectBindings = z.infer<typeof ProjectBindingsSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8),
});
export type ChangePassword = z.infer<typeof ChangePasswordSchema>;

export const FrameworkPresetSchema = z.enum(["auto", "vite", "next", "nuxt", "astro", "html", "custom"]);
export type FrameworkPreset = z.infer<typeof FrameworkPresetSchema>;

export const PreviewConfigSchema = z.object({
  framework: FrameworkPresetSchema.optional(),
  buildCommand: z.string().optional(),
  outputDir: z.string().optional(),
  autoDetected: z.boolean().optional(),
});
export type PreviewConfig = z.infer<typeof PreviewConfigSchema>;

export const PreviewStatusSchema = z.enum(["idle", "building", "ready", "error"]);
export type PreviewStatus = z.infer<typeof PreviewStatusSchema>;

export const PreviewStateSchema = z.object({
  projectName: z.string(),
  status: PreviewStatusSchema,
  distExists: z.boolean(),
  indexHtmlExists: z.boolean(),
  lastBuildAt: z.number().nullable(),
  error: z.string().optional(),
  config: PreviewConfigSchema.optional(),
});
export type PreviewState = z.infer<typeof PreviewStateSchema>;

export const SavePreviewConfigSchema = z.object({
  framework: FrameworkPresetSchema.optional(),
  buildCommand: z.string().optional(),
  outputDir: z.string().optional(),
});
export type SavePreviewConfig = z.infer<typeof SavePreviewConfigSchema>;

export const BuildEventSchema = z.object({
  type: z.enum(["preview_status", "preview_error"]),
  projectName: z.string(),
  status: PreviewStatusSchema.optional(),
  error: z.string().optional(),
  lastBuildAt: z.number().optional(),
});

export type Login = z.infer<typeof LoginSchema>;
export type Prompt = z.infer<typeof PromptSchema>;
export type SessionStatus = z.infer<typeof SessionStatusSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type CreateSession = z.infer<typeof CreateSessionSchema>;
export type ModelSettings = z.infer<typeof ModelSettingsSchema>;
export type SetApiKey = z.infer<typeof SetApiKeySchema>;
export type SetEnvVar = z.infer<typeof SetEnvVarSchema>;

export interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  mimeType?: string;
  content?: string;
  children?: FileInfo[];
  lastModified: string;
}

export interface FileUploadResult {
  name: string;
  path: string;
  size: number;
  mimeType: string;
}

export const AgentDefinitionSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "id must be lowercase alphanumeric with dashes"),
  name: z.string().min(1),
  role: z.string().min(1),
  systemPrompt: z.string().min(1),
  model: z.string().optional(),
  skills: z.array(z.string()).optional(),
  port: z.number().int().min(1024).max(65535).optional(),
  serialTools: z.array(z.string()).optional(),
  avatarUrl: z.string().optional(),
  blueprintId: z.string().optional(),
});
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

export const UpdateAgentDefinitionSchema = AgentDefinitionSchema.partial().omit({ id: true });
export type UpdateAgentDefinition = z.infer<typeof UpdateAgentDefinitionSchema>;

export const AgentStatusSchema = z.enum(["starting", "idle", "streaming", "error", "stopped"]);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const AgentInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  status: AgentStatusSchema,
  port: z.number().optional(),
  createdAt: z.string(),
  skills: z.array(z.string()).optional(),
  avatarUrl: z.string().optional(),
  blueprintId: z.string().optional(),
});
export type AgentInfo = z.infer<typeof AgentInfoSchema>;

export const ReplyModeSchema = z.enum(["user-only", "broadcast", "targeted", "mention-only"]);
export type ReplyMode = z.infer<typeof ReplyModeSchema>;

export const ChannelRoleSchema = z.enum(["lead", "senior", "member", "observer"]);
export type ChannelRole = z.infer<typeof ChannelRoleSchema>;

export const ChannelMemberSchema = z.object({
  agentId: z.string(),
  replyMode: ReplyModeSchema,
  targetAgentIds: z.array(z.string()).optional(),
  role: ChannelRoleSchema.optional(),
});
export type ChannelMember = z.infer<typeof ChannelMemberSchema>;

export const ChannelContextItemSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});
export type ChannelContextItem = z.infer<typeof ChannelContextItemSchema>;

export const NegotiationProtocolSchema = z.object({
  agreementPattern: z.string(),
  counterPattern: z.string().optional(),
  rejectPattern: z.string().optional(),
  maxRounds: z.number().int().min(1).max(20).default(3),
  arbiterAgentId: z.string().optional(),
});
export type NegotiationProtocol = z.infer<typeof NegotiationProtocolSchema>;

export const DelegationPatternSchema = z.object({
  token: z.string().default("DELEGATE: @(\\w+) — (.+)"),
  applyToRole: z.string().optional().default("lead"),
});
export type DelegationPattern = z.infer<typeof DelegationPatternSchema>;

export const ChannelSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  members: z.array(ChannelMemberSchema),
  context: z.array(ChannelContextItemSchema).optional(),
  maxChainDepth: z.number().int().min(1).max(50).optional(),
  showThinking: z.boolean().optional(),
  showTools: z.boolean().optional(),
  negotiationProtocol: NegotiationProtocolSchema.optional(),
  delegationPattern: DelegationPatternSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  blueprintId: z.string().optional(),
});
export type Channel = z.infer<typeof ChannelSchema>;

export const CreateChannelSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  context: z.array(ChannelContextItemSchema).optional(),
  maxChainDepth: z.number().int().min(1).max(50).optional(),
  showThinking: z.boolean().optional(),
  showTools: z.boolean().optional(),
  negotiationProtocol: NegotiationProtocolSchema.optional(),
  delegationPattern: DelegationPatternSchema.optional(),
  blueprintId: z.string().optional(),
});
export type CreateChannel = z.infer<typeof CreateChannelSchema>;

export const UpdateChannelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  context: z.array(ChannelContextItemSchema).optional(),
  maxChainDepth: z.number().int().min(1).max(50).optional(),
  showThinking: z.boolean().optional(),
  showTools: z.boolean().optional(),
  negotiationProtocol: NegotiationProtocolSchema.optional(),
  delegationPattern: DelegationPatternSchema.optional(),
  blueprintId: z.string().optional(),
});
export type UpdateChannel = z.infer<typeof UpdateChannelSchema>;

export const AddMemberSchema = z.object({
  agentId: z.string(),
  replyMode: ReplyModeSchema,
  targetAgentIds: z.array(z.string()).optional(),
  role: ChannelRoleSchema.optional(),
});
export type AddMember = z.infer<typeof AddMemberSchema>;

export const UpdateMemberSchema = z.object({
  replyMode: ReplyModeSchema.optional(),
  targetAgentIds: z.array(z.string()).optional(),
  role: ChannelRoleSchema.optional(),
});
export type UpdateMember = z.infer<typeof UpdateMemberSchema>;

export const ChannelMessageRoleSchema = z.enum(["user", "agent", "system"]);
export type ChannelMessageRole = z.infer<typeof ChannelMessageRoleSchema>;

export const ChannelMessageSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  sessionId: z.string().optional(),
  role: ChannelMessageRoleSchema,
  agentId: z.string().optional(),
  agentName: z.string().optional(),
  content: z.string(),
  thinking: z.string().optional(),
  toolCalls: z.array(z.any()).optional(),
  mentions: z.array(z.string()).optional(),
  tokensIn: z.number().optional(),
  tokensOut: z.number().optional(),
  createdAt: z.string(),
});
export type ChannelMessage = z.infer<typeof ChannelMessageSchema>;

export interface GlobalLogEvent {
  timestamp: string;
  sourceType: "session" | "channel";
  sourceId: string;
  sourceName: string;
  eventType: "agent_start" | "agent_end" | "text_delta" | "thinking_delta" | "tool_start" | "tool_end" | "user_message" | "agent_message" | "error";
  agentName?: string;
  detail?: any;
}

export const AgentExecutionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  messages: z.array(z.any()),
  toolCalls: z.array(z.any()),
  errors: z.array(z.string()),
  durationMs: z.number().optional(),
  tokenUsage: z.object({
    promptTokens: z.number(),
    completionTokens: z.number(),
    totalTokens: z.number(),
  }).optional(),
  createdAt: z.string(),
});
export type AgentExecution = z.infer<typeof AgentExecutionSchema>;

// --- Laboratory Experiments ---

export const LabStanceSchema = z.object({
  id: z.string(),
  name: z.string(),
  template: z.string(),
  position: z.string(),
  briefing: z.string(),
  icon: z.string(),
  color: z.string(),
});
export type LabStance = z.infer<typeof LabStanceSchema>;

export const LabAgentSchema = AgentDefinitionSchema.omit({ id: true }).extend({
  id: z.string(),
  stance: LabStanceSchema.optional(),
  leader: z.boolean().optional(),
});
export type LabAgent = z.infer<typeof LabAgentSchema>;

export const VariantRunResultSchema = z.object({
  status: z.enum(["completed", "failed"]),
  durationMs: z.number(),
  tokensIn: z.number(),
  tokensOut: z.number(),
  negotiationRounds: z.number().optional(),
  escalationsToLeader: z.number().optional(),
  agreementReached: z.boolean(),
  finalOutput: z.string(),
  scores: z.object({
    taskQuality: z.number(),
    efficiencyScore: z.number(),
    negotiationScore: z.number().optional(),
    globalScore: z.number(),
    judgeReasoning: z.string().optional(),
    criteriaScores: z.record(z.number()).optional(),
  }),
});
export type VariantRunResult = z.infer<typeof VariantRunResultSchema>;

export const VariantRunSchema = z.object({
  type: z.enum(["single", "multi_no_leader", "multi_with_leader"]),
  channelId: z.string().optional(),
  activeSessionId: z.string().optional(),
  agents: z.array(LabAgentSchema),
  result: VariantRunResultSchema.optional(),
});
export type VariantRun = z.infer<typeof VariantRunSchema>;

export const LabTestCaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  goldAnswer: z.object({
    fichas: z.number().optional(),
    dias: z.number().optional(),
  }).optional(),
  taskPrompt: z.string().optional(),
});
export type LabTestCase = z.infer<typeof LabTestCaseSchema>;

export const LabBlueprintSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  agents: z.array(z.object({
    id: z.string(),
    name: z.string(),
    role: z.string(),
    systemPromptTemplate: z.string(),
    leader: z.boolean().optional(),
    replyMode: ReplyModeSchema.optional(),
  })),
  channelConfig: z.object({
    name: z.string(),
    negotiationProtocol: z.object({
      agreementPattern: z.string(),
      counterPattern: z.string().optional(),
      rejectPattern: z.string().optional(),
      maxRounds: z.number().int().min(1).max(20).default(3),
      arbiterAgentId: z.string().optional(),
    }).optional(),
    delegationPattern: DelegationPatternSchema.optional(),
    context: z.array(z.object({
      key: z.string(),
      value: z.string(),
    })).optional(),
  }).optional(),
  testCases: z.array(LabTestCaseSchema),
  scoringConfig: z.object({
    metrics: z.array(z.object({
      id: z.string(),
      name: z.string(),
      weight: z.number(),
      type: z.enum(["numeric-deviation", "llm-judge", "custom-script"]),
    })),
  }).optional(),
});
export type LabBlueprint = z.infer<typeof LabBlueprintSchema>;

export const LabExperimentSchema = z.object({
  id: z.string(),
  name: z.string(),
  taskPrompt: z.string(),
  status: z.enum(["designing", "generating", "running", "completed", "failed"]),
  positions: z.array(LabStanceSchema),
  judge: z.object({
    criteria: z.array(z.string()),
    autoEvaluate: z.boolean(),
  }),
  variants: z.object({
    single: VariantRunSchema,
    multiNoLeader: VariantRunSchema,
    multiWithLeader: VariantRunSchema,
  }),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  blueprintId: z.string().optional(),
  activeRunIndex: z.number().optional(),
  activeRunId: z.string().optional(),
  activeVariant: z.enum(["single", "multiNoLeader", "multiWithLeader", "judging"]).nullable().optional(),
});
export type LabExperiment = z.infer<typeof LabExperimentSchema>;

export const McpTransportTypeSchema = z.enum(["stdio", "http"]);
export type McpTransportType = z.infer<typeof McpTransportTypeSchema>;

export const McpServerConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  transport: McpTransportTypeSchema,
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  url: z.string().optional(),
  installed: z.boolean().default(false),
  enabled: z.boolean().default(false),
  isBuiltin: z.boolean().default(false),
  category: z.string().optional(),
  icon: z.string().optional(),
  tools: z.array(z.string()).optional(),
  status: z.enum(["disconnected", "connecting", "connected", "error"]).default("disconnected"),
  error: z.string().optional(),
  lastConnected: z.string().optional(),
});
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

export const McpCatalogItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  icon: z.string(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  url: z.string().optional(),
  homepage: z.string().optional(),
  source: z.string().optional(),
  isHttp: z.boolean().default(false),
});
export type McpCatalogItem = z.infer<typeof McpCatalogItemSchema>;

export const McpConfigSchema = z.object({
  mcpServers: z.record(McpServerConfigSchema),
});
export type McpConfig = z.infer<typeof McpConfigSchema>;

export const UiComponentSchema = z.object({
  type: z.literal("ui_component"),
  sessionId: z.string(),
  componentId: z.string(),
  componentType: z.enum(["approval", "chart", "form"]),
  props: z.record(z.unknown()),
  blocking: z.boolean().optional(),
  persist: z.boolean().optional(),
});
export type UiComponent = z.infer<typeof UiComponentSchema>;

export const UiActionSchema = z.object({
  type: z.literal("ui_action"),
  sessionId: z.string(),
  componentId: z.string(),
  action: z.string(),
  payload: z.record(z.unknown()).optional(),
});
export type UiAction = z.infer<typeof UiActionSchema>;

// --- Gallery Blueprints ---

export const GalleryMetadataSchema = z.object({
  title: z.string(),
  description: z.string(),
  author: z.string(),
  avatar: z.string().optional(),
  rating: z.number().optional(),
  downloads: z.number().optional(),
  tags: z.array(z.string()).default([]),
  created: z.string().optional(),
  updated: z.string().optional(),
  version: z.string(),
  compatibility: z.string().optional(),
});
export type GalleryMetadata = z.infer<typeof GalleryMetadataSchema>;

export const BlueprintTypeSchema = z.enum(["agent", "channel"]);
export type BlueprintType = z.infer<typeof BlueprintTypeSchema>;

export const GalleryItemSchema = z.object({
  id: z.string(),
  type: BlueprintTypeSchema,
  definition: z.union([AgentDefinitionSchema, CreateChannelSchema]),
  metadata: GalleryMetadataSchema,
  hasIcon: z.boolean().optional(),
});
export type GalleryItem = z.infer<typeof GalleryItemSchema>;

export const PendingDelegationSchema = z.object({
  toolCallId: z.string(),
  parentSessionId: z.string(),
  targetType: z.enum(["spawn", "delegate"]),
  targetLabel: z.string(),
  task: z.string(),
  status: z.enum(["running", "success", "error", "blocked"]),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  result: z.any().optional(),
  subagentSessionId: z.string(),
});
export type PendingDelegation = z.infer<typeof PendingDelegationSchema>;





