import type { TeamMessage } from "shared";

export type DivergenceEvent = {
  agents: [string, string];
  topic: string;
  delta: number;
  triggerType: "score_delta" | "explicit_objection" | "veto" | "deadlock";
  severity: "low" | "medium" | "high";
  reason: string;
};

export class DivergenceDetector {
  static detect(messages: TeamMessage[], threshold = 2): DivergenceEvent | null {
    // 1. Check for explicit keywords in the very last message
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "agent") return null;

    const content = lastMsg.content || "";
    const senderId = lastMsg.agentId || "unknown";
    const senderName = lastMsg.agentName || senderId;

    // Check Veto (High Severity)
    if (content.includes("VETO:")) {
      const match = content.match(/VETO:\s*(.*)/i);
      const reason = match ? match[1].trim() : "Veto de seguridad emitido.";
      return {
        agents: [senderName, "System"],
        topic: "Security Compliance",
        delta: 10,
        triggerType: "veto",
        severity: "high",
        reason: `VETO por @${senderName}: ${reason}`
      };
    }

    // Check Deadlock
    if (content.includes("DEADLOCK:")) {
      const match = content.match(/DEADLOCK:\s*(.*)/i);
      const reason = match ? match[1].trim() : "Bloqueo mutuo declarado.";
      return {
        agents: [senderName, "System"],
        topic: "Consensus Deadlock",
        delta: 5,
        triggerType: "deadlock",
        severity: "high",
        reason: `DEADLOCK declarado por @${senderName}: ${reason}`
      };
    }

    // Check Objection
    if (content.includes("OBJECTION:")) {
      const match = content.match(/OBJECTION:\s*(.*)/i);
      const reason = match ? match[1].trim() : "Objeción presentada.";
      return {
        agents: [senderName, "System"],
        topic: "Architectural Objection",
        delta: 3,
        triggerType: "explicit_objection",
        severity: "medium",
        reason: `OBJECTION por @${senderName}: ${reason}`
      };
    }

    // 2. Parse scores across recent messages to detect score delta (O(1) fast check)
    const SCORE_FAST_CHECK = /SCORE\s*[:=\[]|:\s*\d+\/10/i;
    const scanWindow = messages.slice(-3);
    const hasAnyScore = scanWindow.some(
      (m) => m.role === "agent" && m.content && SCORE_FAST_CHECK.test(m.content)
    );
    if (!hasAnyScore) {
      return null;
    }

    // Map of topic -> Map of agentName -> score
    const scoresByTopic = new Map<string, Map<string, number>>();

    const regexList = [
      // 1. SCORE: [topic] = X/10
      /SCORE:\s*\[([a-zA-Z0-9_áéíóúñ\s-]+)\]\s*=\s*(\d+)\/10/gi,
      // 2. SCORE: topic = X/10 (no spaces)
      /SCORE:\s*([a-zA-Z0-9_áéíóúñ-]+)\s*=\s*(\d+)\/10/gi,
      // 3. SCORE: X/10 para [topic]
      /SCORE:\s*(\d+)\/10\s+(?:para|for|de|on)?\s*\[([a-zA-Z0-9_áéíóúñ\s-]+)\]/gi,
      // 4. SCORE: X/10 para topic (no spaces)
      /SCORE:\s*(\d+)\/10\s+(?:para|for|de|on)?\s*([a-zA-Z0-9_áéíóúñ-]+)/gi,
      // 5. [topic]: X/10
      /\[([a-zA-Z0-9_áéíóúñ\s-]+)\]:\s*(\d+)\/10/gi,
      // 6. topic: X/10 (no spaces, using word boundary)
      /\b([a-zA-Z0-9_áéíóúñ-]+):\s*(\d+)\/10/gi,
      // 7. Puntúo [topic] con X/10
      /Puntúo\s+\[([a-zA-Z0-9_áéíóúñ\s-]+)\]\s+con\s+(\d+)\/10/gi,
      // 8. Puntúo topic con X/10 (no spaces)
      /Puntúo\s+([a-zA-Z0-9_áéíóúñ-]+)\s+con\s+(\d+)\/10/gi
    ];

    for (const msg of scanWindow) {
      if (msg.role !== "agent" || !msg.content) continue;
      const agentName = msg.agentName || msg.agentId || "unknown";

      for (const regex of regexList) {
        const matches = msg.content.matchAll(regex);
        for (const match of matches) {
          let topic: string;
          let valStr: string;

          if (regex.source.includes("(?:para|for|de|on)")) {
            valStr = match[1];
            topic = match[2];
          } else {
            topic = match[1];
            valStr = match[2];
          }

          const topicClean = topic.trim().toLowerCase();

          // Skip generic keywords to avoid capturing formatting noise
          if (["score", "objection", "veto", "deadlock", "resolution", "acuerdo", "acepto"].includes(topicClean)) {
            continue;
          }

          const val = parseInt(valStr, 10);
          if (isNaN(val)) continue;

          if (!scoresByTopic.has(topicClean)) {
            scoresByTopic.set(topicClean, new Map<string, number>());
          }
          scoresByTopic.get(topicClean)!.set(agentName, val);
        }
      }
    }

    // Find any topic where two agents differ by >= threshold
    for (const [topic, agentScores] of scoresByTopic.entries()) {
      const agents = Array.from(agentScores.keys());
      for (let i = 0; i < agents.length; i++) {
        for (let j = i + 1; j < agents.length; j++) {
          const scoreA = agentScores.get(agents[i])!;
          const scoreB = agentScores.get(agents[j])!;
          const diff = Math.abs(scoreA - scoreB);

          if (diff >= threshold) {
            return {
              agents: [agents[i], agents[j]],
              topic: topic.toUpperCase(),
              delta: diff,
              triggerType: "score_delta",
              severity: diff >= 4 ? "high" : "medium",
              reason: `Divergencia de score en [${topic.toUpperCase()}]: @${agents[i]} dio ${scoreA}/10, mientras @${agents[j]} dio ${scoreB}/10 (Delta: ${diff})`
            };
          }
        }
      }
    }

    return null;
  }
}
