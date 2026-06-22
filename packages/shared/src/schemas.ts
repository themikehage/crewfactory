import { z } from "zod";

export const LoginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8),
});

export const PromptSchema = z.object({
  message: z.string().min(1),
});

export const SessionSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  messageCount: z.number(),
  repoName: z.string().optional(),
});

export const CreateSessionSchema = z.object({
  name: z.string().min(1).max(100),
  repoName: z.string().optional(),
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

export type Login = z.infer<typeof LoginSchema>;
export type Prompt = z.infer<typeof PromptSchema>;
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
  content?: string; // base64 encoded for files
  children?: FileInfo[];
  lastModified: string; // ISO string representation
}

export interface FileUploadResult {
  name: string;
  path: string;
  size: number;
  mimeType: string;
}

