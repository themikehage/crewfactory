import { AVAILABLE_TOOLS } from "shared";
import { sessionMetadataStore } from "../session/metadata-store";
import { sessionManager } from "../session-manager";
import { userPermissionStore } from "./user-permission-store";

export interface ToolPermissionRule {
  /** Name of the tool (e.g., "bash", "write", "*") */
  toolName: string;
  /** Pattern for argument matching. "*" = match all. "git *" = match command starting with git. */
  pattern: string;
  /** Action to perform: allow execution, deny execution, or ask the user */
  action: "allow" | "deny" | "ask";
  /** Origin of this rule for tracing and priority ranking */
  source: "agent-default" | "session-inherited" | "user-decision" | "system-deny";
}

export interface SubagentPermissionConfig {
  rules: ToolPermissionRule[];
  excludedTools: string[];
  maxDepth: number;
}

export const DEFAULT_SUBAGENT_PERMISSIONS: SubagentPermissionConfig = {
  rules: [
    // System-deny defaults to prevent dangerous operations or nesting loops by default
    { toolName: "spawn_subagent", pattern: "*", action: "deny", source: "agent-default" },
    { toolName: "delegate_task", pattern: "*", action: "deny", source: "agent-default" },
    { toolName: "manage_factory", pattern: "*", action: "deny", source: "agent-default" },
    { toolName: "manage_custom_tools", pattern: "*", action: "deny", source: "agent-default" },
    { toolName: "manage_pipelines", pattern: "*", action: "deny", source: "agent-default" },

    // Safe read tools allowed by default
    { toolName: "read", pattern: "*", action: "allow", source: "agent-default" },
    { toolName: "grep", pattern: "*", action: "allow", source: "agent-default" },
    { toolName: "find", pattern: "*", action: "allow", source: "agent-default" },
    { toolName: "ls", pattern: "*", action: "allow", source: "agent-default" },

    // Modification tools require user verification by default
    { toolName: "write", pattern: "*", action: "ask", source: "agent-default" },
    { toolName: "edit", pattern: "*", action: "ask", source: "agent-default" },
    { toolName: "bash", pattern: "*", action: "ask", source: "agent-default" },

    // External search tools disabled by default for subagents
    { toolName: "web_fetch", pattern: "*", action: "deny", source: "agent-default" },
    { toolName: "exa_search", pattern: "*", action: "deny", source: "agent-default" },
  ],
  excludedTools: [
    "spawn_subagent",
    "delegate_task",
    "manage_factory",
    "manage_custom_tools",
    "manage_pipelines",
  ],
  maxDepth: 1,
};

/**
 * Converts a wildcard string (e.g. "git *") to a RegExp.
 */
export function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regexStr = "^" + escaped.replace(/\*/g, ".*") + "$";
  return new RegExp(regexStr, "i");
}

/**
 * Matches a subject against a wildcard pattern.
 */
export function matchPattern(subject: string, pattern: string): boolean {
  if (pattern === "*") return true;
  return wildcardToRegex(pattern).test(subject);
}

/**
 * Matches a tool name against a wildcard (supports "*" and literal).
 */
export function matchWildcard(value: string, pattern: string): boolean {
  if (pattern === "*") return true;
  return value.toLowerCase() === pattern.toLowerCase();
}

/**
 * Helper to get base rules depending on subagent type (explorer vs builder).
 */
function getBaseRulesForType(subagentType?: string): ToolPermissionRule[] {
  const defaults = DEFAULT_SUBAGENT_PERMISSIONS.rules;
  if (subagentType === "explorer") {
    // Explorer is read-only, deny modification tools
    return defaults.map(rule => {
      if (["write", "edit", "bash"].includes(rule.toolName)) {
        return { ...rule, action: "deny" as const };
      }
      return rule;
    });
  }
  if (subagentType === "autonomous") {
    // Autonomous allows modification tools without asking
    return defaults.map(rule => {
      if (["write", "edit", "bash"].includes(rule.toolName)) {
        return { ...rule, action: "allow" as const };
      }
      return rule;
    });
  }
  return defaults;
}

/**
 * Build effective ruleset for a subagent session.
 * Merges system defaults, parent limits, metadata rules, and user persistent decisions.
 */
export function buildSubagentRules(
  username: string,
  subagentSessionId: string,
  parentSessionId?: string,
  subagentType?: string
): ToolPermissionRule[] {
  const rules: ToolPermissionRule[] = [];

  let resolvedType = subagentType;
  if (!resolvedType) {
    const meta = sessionMetadataStore.getSessionMetadata(username, subagentSessionId);
    if (meta) {
      if (typeof meta.subagentType === "string") {
        resolvedType = meta.subagentType;
      } else if (typeof meta.executionMode === "string") {
        resolvedType =
          meta.executionMode === "readonly" ? "explorer" :
          meta.executionMode === "autonomous" ? "autonomous" :
          "builder";
      }
    }
  }

  // 1. Defaults for this subagent type
  rules.push(...getBaseRulesForType(resolvedType));

  // 2. Parent constraints
  if (parentSessionId) {
    const parentSession = sessionManager.getSession(username, parentSessionId);
    const parentTools = parentSession
      ? parentSession.getActiveToolNames()
      : sessionMetadataStore.getSessionTools(username, parentSessionId);

    // Any tool NOT in the parent's active list is denied (Read-Only ceiling)
    const allKnownTools = [...AVAILABLE_TOOLS];
    for (const tool of allKnownTools) {
      if (!parentTools.includes(tool)) {
        rules.push({
          toolName: tool,
          pattern: "*",
          action: "deny",
          source: "session-inherited",
        });
      }
    }

    // Inherit explicit permissionRules from parent metadata if they exist
    const parentMeta = sessionMetadataStore.getSessionMetadata(username, parentSessionId);
    if (parentMeta && Array.isArray(parentMeta.permissionRules)) {
      rules.push(
        ...parentMeta.permissionRules.map((r: any) => ({
          ...r,
          source: "session-inherited" as const,
        }))
      );
    }
  }

  // 3. Persistent user decisions (highest priority, appended last for last-match-wins)
  const userDecisions = userPermissionStore.getDecisions(username);
  rules.push(...userDecisions);

  return rules;
}

/**
 * Extracts the subject for a tool call to perform argument pattern matching.
 */
export function extractSubject(toolName: string, args: Record<string, unknown>): string {
  if (!args || typeof args !== "object") return "";
  if (toolName === "bash") return String(args.command ?? "");
  if (toolName === "write" || toolName === "read" || toolName === "edit") {
    return String(args.path ?? args.filepath ?? "");
  }
  return JSON.stringify(args);
}

/**
 * Evaluates custom subagent rules. Returns the matching verdict, or null if no rule applies.
 */
export function evaluateSubagentRules(
  toolName: string,
  args: Record<string, unknown>,
  rules: ToolPermissionRule[]
): { allow: boolean | "ask"; reason: string } | null {
  const subject = extractSubject(toolName, args);

  const matched = rules.findLast((rule) => {
    const toolMatch = matchWildcard(toolName, rule.toolName);
    const patternMatch = matchPattern(subject, rule.pattern);
    return toolMatch && patternMatch;
  });

  if (matched) {
    if (matched.action === "allow") {
      return { allow: true, reason: `Allowed by rule: ${matched.toolName} ${matched.pattern} (${matched.source})` };
    }
    if (matched.action === "deny") {
      return { allow: false, reason: `Denied by rule: ${matched.toolName} ${matched.pattern} (${matched.source})` };
    }
    if (matched.action === "ask") {
      return { allow: "ask", reason: `Requires approval by rule: ${matched.toolName} ${matched.pattern} (${matched.source})` };
    }
  }

  return null;
}
