import { agentRegistry } from "../../agents";
import { type TeamMember, type TeamMessage } from "shared";

export function buildAgentNameMap(members: TeamMember[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const member of members) {
    const entry = agentRegistry.get(member.agentId);
    if (entry) {
      map.set(member.agentId, entry.server.definition.name);
    }
  }
  return map;
}

export function buildAgentPrompt(
  incomingMsg: TeamMessage,
  recentHistory: TeamMessage[],
  contextItems: { key: string; value: string }[] = []
): string {
  let historyText = "";
  for (const msg of recentHistory) {
    if (msg.role === "user") {
      historyText += `[User]: ${msg.content}\n`;
    } else {
      historyText += `[${msg.agentName || msg.agentId}]: ${msg.content}\n`;
    }
  }

  let contextBlock = "";
  if (contextItems.length > 0) {
    contextBlock =
      `Channel Environmental Context Variables:\n` +
      contextItems.map((item) => `- ${item.key}: ${item.value}`).join("\n") +
      "\n\n";
  }

  const senderLabel =
    incomingMsg.role === "user" ? "User" : incomingMsg.agentName || incomingMsg.agentId;

  return (
    contextBlock +
    `Conversation so far:\n${historyText}\n` +
    `--- New message from ${senderLabel} ---\n` +
    `${incomingMsg.content}`
  );
}
