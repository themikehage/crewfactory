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

export type Login = z.infer<typeof LoginSchema>;
export type Prompt = z.infer<typeof PromptSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type CreateSession = z.infer<typeof CreateSessionSchema>;
export type ModelSettings = z.infer<typeof ModelSettingsSchema>;
export type SetApiKey = z.infer<typeof SetApiKeySchema>;
export type SetEnvVar = z.infer<typeof SetEnvVarSchema>;

export const TaskStatusSchema = z.enum(["pending", "running", "done", "failed"]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const RunStatusSchema = z.enum(["running", "paused", "done", "failed"]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const TaskItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  status: TaskStatusSchema,
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  log: z.string(),
  retries: z.number().default(0),
});
export type TaskItem = z.infer<typeof TaskItemSchema>;

export const TaskRunSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  objective: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: RunStatusSchema,
  currentTaskIndex: z.number(),
  tasks: z.array(TaskItemSchema),
});
export type TaskRun = z.infer<typeof TaskRunSchema>;

export const CreateTaskRunSchema = z.union([
  z.object({ objective: z.string().min(1) }),
  z.object({
    objective: z.string().default("Manual task list"),
    tasks: z.array(z.object({
      title: z.string().min(1),
      prompt: z.string().min(1),
    })).min(1),
  }),
]);
export type CreateTaskRun = z.infer<typeof CreateTaskRunSchema>;

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

