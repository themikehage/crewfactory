import type { ChannelMember } from "shared";

export interface MentionTarget {
  agentId: string;
  name: string;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parse @mentions from message content.
 * Matches both @agentId and @AgentName (case-insensitive, word boundary).
 * Adds "__user__" sentinel when @user is mentioned.
 * Returns a deduplicated array of agentId strings (or "__user__").
 */
export function parseMentions(
  content: string,
  members: ChannelMember[],
  agentNames: Map<string, string>
): string[] {
  const mentioned = new Set<string>();

  // Check for @user mention
  if (/@user\b/i.test(content)) {
    mentioned.add("__user__");
  }

  for (const member of members) {
    const name = agentNames.get(member.agentId) || member.agentId;
    const patterns = [
      new RegExp(`@${escapeRegex(member.agentId)}\\b`, "i"),
      new RegExp(`@${escapeRegex(name).replace(/\s+/g, "\\s+")}\\b`, "i"),
    ];
    if (patterns.some((p) => p.test(content))) {
      mentioned.add(member.agentId);
    }
  }

  return Array.from(mentioned);
}

/**
 * Build a name map from agentId -> displayName for use with parseMentions.
 */
export function buildAgentNameMap(
  members: ChannelMember[],
  agentEntries: Map<string, { name: string }>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const member of members) {
    const entry = agentEntries.get(member.agentId);
    if (entry) map.set(member.agentId, entry.name);
  }
  return map;
}
