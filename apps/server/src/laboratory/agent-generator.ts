import { piSessionManager } from "../pi/session-manager";
import { DICHOTOMY_TEMPLATES } from "./dichotomy-templates";
import { type LabStance } from "shared";

export class AgentGenerator {
  static async analyzeTask(
    username: string,
    taskPrompt: string
  ): Promise<{
    suggestedDichotomies: { id: string; reason: string }[];
    criteria: string[];
  }> {
    const sessionId = `generator_${crypto.randomUUID()}`;
    const session = await piSessionManager.getOrCreateSession(username, sessionId);

    const promptText = `
You are an AI Architect. Analyze the following project task and suggest:
1. The top 2 most relevant dichotomy templates from this catalog: ${JSON.stringify(
      DICHOTOMY_TEMPLATES.map((d) => ({ id: d.id, name: d.name, description: d.description }))
    )}
2. A list of 3-5 specific evaluation criteria for a scoring rubric (e.g. "Completitud", "Viabilidad técnica", "Claridad", etc.).

Project Task:
"${taskPrompt}"

Output ONLY a JSON object matching this structure (no additional text, explanations, or code fences):
{
  "suggestedDichotomies": [
    { "id": "template_id", "reason": "why this is relevant to this task" }
  ],
  "criteria": ["Criterion 1", "Criterion 2", "Criterion 3"]
}
`;

    try {
      await session.prompt(promptText);
      const msgs = session.messages;
      const lastMsg = [...msgs].reverse().find((m) => m.role === "assistant");
      let rawJson = "";
      if (lastMsg) {
        if (typeof lastMsg.content === "string") rawJson = lastMsg.content;
        else if (Array.isArray(lastMsg.content)) {
          rawJson = lastMsg.content.map((c: any) => c.text || "").join("\n");
        }
      }

      // Clean markdown code blocks if any
      rawJson = rawJson.trim();
      if (rawJson.startsWith("```")) {
        rawJson = rawJson.replace(/^```[a-zA-Z-]*\n/, "").replace(/\n```$/, "");
      }

      const parsed = JSON.parse(rawJson);
      return {
        suggestedDichotomies: parsed.suggestedDichotomies || [],
        criteria: parsed.criteria || ["Completitud", "Claridad", "Viabilidad Técnica"],
      };
    } catch (e) {
      console.error("[AgentGenerator] Failed to analyze task:", e);
      return {
        suggestedDichotomies: DICHOTOMY_TEMPLATES.slice(0, 2).map((d) => ({ id: d.id, reason: "Fallback default" })),
        criteria: ["Completitud", "Claridad", "Viabilidad Técnica"],
      };
    } finally {
      await piSessionManager.destroySession(username, sessionId);
    }
  }

  static async generateStanceBriefings(
    username: string,
    taskPrompt: string,
    dichotomies: string[]
  ): Promise<LabStance[]> {
    const sessionId = `briefings_${crypto.randomUUID()}`;
    const session = await piSessionManager.getOrCreateSession(username, sessionId);

    // Build the request
    const selectedTemplates = DICHOTOMY_TEMPLATES.filter((t) => dichotomies.includes(t.id));
    if (selectedTemplates.length === 0) return [];

    const promptText = `
You are an AI Prompt Engineer. For the given project task, generate custom agent briefings for the following chosen roles/dichotomies.
Each briefing must be a detailed, 1-paragraph system prompt instruction explaining the role's point of view, priorities, arguments, and guidelines adapted specifically to the project task.

Project Task:
"${taskPrompt}"

Roles to generate briefings for:
${JSON.stringify(
  selectedTemplates.flatMap((t) => [
    { id: `${t.id}_a`, name: t.stanceA.name, title: t.stanceA.defaultTitle, guidelines: t.stanceA.systemPromptGuidelines },
    { id: `${t.id}_b`, name: t.stanceB.name, title: t.stanceB.defaultTitle, guidelines: t.stanceB.systemPromptGuidelines }
  ])
)}

Output ONLY a JSON object matching this structure (no additional text, explanations, or code fences):
{
  "briefings": {
    "role_id": "Detailed 1-paragraph briefing adapted to the task..."
  }
}
`;

    try {
      await session.prompt(promptText);
      const msgs = session.messages;
      const lastMsg = [...msgs].reverse().find((m) => m.role === "assistant");
      let rawJson = "";
      if (lastMsg) {
        if (typeof lastMsg.content === "string") rawJson = lastMsg.content;
        else if (Array.isArray(lastMsg.content)) {
          rawJson = lastMsg.content.map((c: any) => c.text || "").join("\n");
        }
      }

      rawJson = rawJson.trim();
      if (rawJson.startsWith("```")) {
        rawJson = rawJson.replace(/^```[a-zA-Z-]*\n/, "").replace(/\n```$/, "");
      }

      const parsed = JSON.parse(rawJson);
      const briefings = parsed.briefings || {};

      const stances: LabStance[] = [];
      for (const t of selectedTemplates) {
        stances.push({
          id: `${t.id}_a`,
          name: t.stanceA.name,
          template: t.id,
          position: "A",
          briefing: briefings[`${t.id}_a`] || t.stanceA.systemPromptGuidelines,
          icon: t.stanceA.icon,
          color: t.stanceA.color
        });
        stances.push({
          id: `${t.id}_b`,
          name: t.stanceB.name,
          template: t.id,
          position: "B",
          briefing: briefings[`${t.id}_b`] || t.stanceB.systemPromptGuidelines,
          icon: t.stanceB.icon,
          color: t.stanceB.color
        });
      }
      return stances;
    } catch (e) {
      console.error("[AgentGenerator] Failed to generate briefings:", e);
      // Fallback to defaults
      const stances: LabStance[] = [];
      for (const t of selectedTemplates) {
        stances.push({
          id: `${t.id}_a`,
          name: t.stanceA.name,
          template: t.id,
          position: "A",
          briefing: t.stanceA.systemPromptGuidelines,
          icon: t.stanceA.icon,
          color: t.stanceA.color
        });
        stances.push({
          id: `${t.id}_b`,
          name: t.stanceB.name,
          template: t.id,
          position: "B",
          briefing: t.stanceB.systemPromptGuidelines,
          icon: t.stanceB.icon,
          color: t.stanceB.color
        });
      }
      return stances;
    } finally {
      await piSessionManager.destroySession(username, sessionId);
    }
  }
}
