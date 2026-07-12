export interface ResolveActiveToolsParams {
  sessionTools: string[];
  persistedTools?: string[];
  hasExaKey: boolean;
  memoryEnabled: boolean;
  resolvedAgentId?: string;
}

export function resolveActiveTools({
  sessionTools,
  persistedTools,
  hasExaKey,
  memoryEnabled,
  resolvedAgentId,
}: ResolveActiveToolsParams): string[] {
  let activeTools = persistedTools || sessionTools;

  if (!hasExaKey) {
    activeTools = activeTools.filter((t) => t !== "exa_search");
  }

  const alwaysOnTools = [
    "request_approval",
    "ask_question",
    "render_images",
    "render_html",
    "render_chart",
    "share_file",
    "refresh_ui",
    "decompose_tasks",
    "update_task_status",
    "complete_task_list",
    "vision",
    "generate_image",
    "manage_factory",
  ];
  if (resolvedAgentId === "lab-architect") {
    alwaysOnTools.push("create_experiment");
  } else {
    alwaysOnTools.push("spawn_subagent", "delegate_task");
  }

  const definedToolNames = new Set([
    ...sessionTools,
    "bash",
    "exa_search",
    ...alwaysOnTools,
  ]);
  if (memoryEnabled) {
    definedToolNames.add("memory_store");
    definedToolNames.add("memory_recall");
    definedToolNames.add("memory_forget");
  }

  return Array.from(new Set([
    ...activeTools,
    ...alwaysOnTools,
    ...(memoryEnabled ? ["memory_store", "memory_recall", "memory_forget"] : []),
  ])).filter((tName) => definedToolNames.has(tName));
}
