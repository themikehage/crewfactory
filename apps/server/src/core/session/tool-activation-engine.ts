export interface ResolveActiveToolsParams {
  sessionTools: string[];
  persistedTools?: string[];
  hasExaKey: boolean;
  memoryEnabled: boolean;
  resolvedAgentId?: string;
  customToolNames?: string[];
}

export function resolveActiveTools({
  sessionTools,
  persistedTools,
  hasExaKey,
  memoryEnabled,
  resolvedAgentId,
  customToolNames = [],
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
    "manage_custom_tools",
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
    "web_fetch",
    ...alwaysOnTools,
    ...customToolNames,
  ]);
  if (memoryEnabled) {
    definedToolNames.add("memory_store");
    definedToolNames.add("memory_recall");
    definedToolNames.add("memory_forget");
  }

  const enabledCustomSet = new Set(customToolNames);

  const merged = new Set<string>([
    ...activeTools,
    ...alwaysOnTools,
    ...(memoryEnabled ? ["memory_store", "memory_recall", "memory_forget"] as const : []),
    ...customToolNames,
  ]);

  // Persisted tools may explicitly disable a custom tool by omission? We respect enabled list as source of truth.
  // If persistedTools exists, we still keep custom tools that are enabled unless they were explicitly disabled via toggle,
  // but toggle updates storage not persisted list. So always include enabled custom tools.
  // To support disabling via UI, we check if persistedTools exists and does NOT contain a custom tool,
  // we still include it if it's in customToolNames (enabled in storage) but we don't force-remove.
  // The filtering below ensures only defined names pass.

  // If persistedTools is set and does NOT contain a custom tool, it means user might have disabled it? 
  // But customToolNames only contains enabled ones, so we keep them.
  // For strict respect of persistedTools containing custom names, we still add enabled ones.
  // If user explicitly removed from permissions, they'd need to toggle off.

  return Array.from(merged).filter((tName) => definedToolNames.has(tName) || enabledCustomSet.has(tName));
}
