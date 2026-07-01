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
  repoName: z.string().optional(),
  agentId: z.string().optional(),
  channelId: z.string().optional(),
});

export const CreateSessionSchema = z.object({
  name: z.string().min(1).max(100),
  repoName: z.string().optional(),
  agentId: z.string().optional(),
  channelId: z.string().optional(),
});

export const ModelSettingsSchema = z.object({
  provider: z.string(),
  modelId: z.string(),
  thinkingLevel: z.enum(["off", "minimal", "low", "medium", "high", "xhigh"]),
});

export const AVAILABLE_TOOLS = ["read", "write", "edit", "bash", "grep", "find", "ls"] as const;
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
  requiredRepoVars: z.array(z.string()),
  actions: z.array(QuickActionSchema),
});
export type IntegrationTemplate = z.infer<typeof IntegrationTemplateSchema>;

export const SaveTemplatesSchema = z.object({
  templates: z.array(IntegrationTemplateSchema),
});
export type SaveTemplates = z.infer<typeof SaveTemplatesSchema>;

export const RepoBindingsSchema = z.record(z.string(), z.record(z.string(), z.string()));
export type RepoBindings = z.infer<typeof RepoBindingsSchema>;

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
  repoName: z.string(),
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
  repoName: z.string(),
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

export const ChannelSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  members: z.array(ChannelMemberSchema),
  context: z.array(ChannelContextItemSchema).optional(),
  maxChainDepth: z.number().int().min(1).max(50).optional(),
  showThinking: z.boolean().optional(),
  showTools: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Channel = z.infer<typeof ChannelSchema>;

export const CreateChannelSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  context: z.array(ChannelContextItemSchema).optional(),
  maxChainDepth: z.number().int().min(1).max(50).optional(),
  showThinking: z.boolean().optional(),
  showTools: z.boolean().optional(),
});
export type CreateChannel = z.infer<typeof CreateChannelSchema>;

export const UpdateChannelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  context: z.array(ChannelContextItemSchema).optional(),
  maxChainDepth: z.number().int().min(1).max(50).optional(),
  showThinking: z.boolean().optional(),
  showTools: z.boolean().optional(),
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

export const ChannelMessageRoleSchema = z.enum(["user", "agent"]);
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

