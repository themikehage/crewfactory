import { agentRegistry } from "../agents";
import { sessionManager } from "../core/session-manager";
import { activeContextStorage } from "../core/session/active-context";
import { resolveModelWithFallback } from "../core/agent-utils";
import { assemblePromptAppends } from "../core/prompts/prompt-assembly";
import { buildDeploymentContext } from "../core/channel/deployment-context";
import { parseAgentResponse } from "../channels/response-parser";
import { ensureWorkspaceSubdirs } from "../core/session/workspace-resolver";
import { memoryRegistry } from "../core/memory/registry";
import { getTeamWorkspaceDir, getTeamMemoryDbPath } from "shared";
import type { TeamDefinition, TeamMember, TeamMessage, TeamEvent, TeamEventType } from "shared";

export interface TeamTurnResult {
  agentMsg: TeamMessage | null;
}

function isSubstantiveMessage(content: string): boolean {
  if (content.trim().length <= 10) return false;
  const trivial = /^(hola|para|ok|si|no|gracias|dale|listo|stop|hey|hi|hello|\.\.\.)$/i;
  return !trivial.test(content.trim());
}

export async function runTeamTurn(
  username: string,
  team: TeamDefinition,
  sessionId: string,
  member: TeamMember,
  historyMessages: TeamMessage[],
  signal: AbortSignal,
  broadcast: (type: TeamEventType, agentId: string, agentName: string, payload: Record<string, unknown>, toolCallId?: string) => void
): Promise<TeamTurnResult> {
  if (signal.aborted) return { agentMsg: null };

  const agentEntry = agentRegistry.get(member.agentId);
  if (!agentEntry || agentEntry.status === "stopped") {
    broadcast("agent_error", member.agentId, "", { error: `Agent "${member.agentId}" is not available` });
    return { agentMsg: null };
  }

  const agentName = agentEntry.server.definition.name;

  if (!agentEntry.server.session.model) {
    const { modelRegistry } = sessionManager.userConfig.getUserContext(username);
    modelRegistry.refresh();
    const resolved = resolveModelWithFallback(undefined, modelRegistry);
    if (resolved) {
      const model = modelRegistry.getAvailable().find((m) => m.id === resolved || `${m.provider}/${m.id}` === resolved);
      if (model) {
        try { await agentEntry.server.session.setModel(model); } catch {}
      }
    }
  }

  if (!agentEntry.server.session.model) {
    broadcast("agent_error", member.agentId, agentName, {
      error: `No LLM providers available for agent "${agentName}". Please configure API keys in Settings.`,
    });
    return { agentMsg: null };
  }

  broadcast("turn_started", member.agentId, agentName, {});

  const userSettings = sessionManager.userConfig.getUserSettings(username);
  const memoryEnabled = userSettings.memoryEnabled ?? true;

  const lastUserMsg = [...historyMessages].reverse().find((m) => m.role === "user");
  const queryContent = lastUserMsg?.content ?? "";
  const substantive = isSubstantiveMessage(queryContent);

  const channelMemoryDbPath = getTeamMemoryDbPath(username, team.id);
  const teamMemory = await memoryRegistry.get(`team:${team.id}`, channelMemoryDbPath, memoryEnabled);

  const [agentMemCtx, teamMemCtx] = substantive
    ? await Promise.all([
        agentEntry.server.memory.buildContext(queryContent, { sessionId }),
        teamMemory.buildContext(queryContent, { sessionId }),
      ])
    : ["", ""];

  let memoryPrefix = "";
  if (agentMemCtx) memoryPrefix += `${agentMemCtx}\n\n`;
  if (teamMemCtx) {
    memoryPrefix += teamMemCtx.replace(
      "--- Memories from previous sessions",
      "--- Team Memories from previous sessions"
    ) + "\n\n";
  }

  const agentNameMap = new Map<string, string>();
  for (const m of team.members) {
    const entry = agentRegistry.get(m.agentId);
    if (entry) agentNameMap.set(m.agentId, entry.server.definition.name);
  }

  const teamWorkspaceDir = getTeamWorkspaceDir(username, team.id);
  ensureWorkspaceSubdirs(teamWorkspaceDir);

  const originalCwd = agentEntry.server.session.cwd;
  agentEntry.server.session.cwd = teamWorkspaceDir;

  try {
    const agentPromptRevision = JSON.stringify(agentEntry.server.definition);
    const deploymentContext = {
      teamId: team.id,
      teamName: team.name,
      topology: team.topology,
      role: member.role,
      agentName,
      peers: team.members
        .filter((m) => m.agentId !== member.agentId)
        .map((m) => ({ agentId: m.agentId, agentName: agentNameMap.get(m.agentId) ?? m.agentId, role: m.role })),
    };

    const appendSystemPrompts = assemblePromptAppends({
      mode: "channel-member",
      workspaceDir: teamWorkspaceDir,
      agentDef: agentEntry.server.definition,
      deployment: {
        teamId: team.id,
        agentId: member.agentId,
        agentName,
        role: member.role,
        peers: deploymentContext.peers,
        outputMode: "normal",
        topology: team.topology,
      } as any,
    });

    const teamContextBlock = `Team: ${team.name}\nTopology: ${team.topology}\nYour role: ${member.role}\nPeers: ${deploymentContext.peers.map((p) => `${p.agentName} (${p.role})`).join(", ") || "none"}\n\n`;
    const combinedPrefix = memoryPrefix + teamContextBlock;

    const resourceLoader = agentEntry.server.session.resourceLoader as any;
    if (resourceLoader && typeof resourceLoader.setAppendSystemPrompt === "function") {
      if (resourceLoader._appendSystemPrompt !== appendSystemPrompts) {
        resourceLoader.setAppendSystemPrompt(appendSystemPrompts);
        await resourceLoader.reload();
      }
    }

    const historyToSync = historyMessages.length > 0 ? historyMessages.map((m) => ({
      id: m.id,
      channelId: team.id,
      sessionId,
      role: m.role === "agent" ? "agent" : m.role === "system" ? "system" : "user",
      agentId: m.agentId,
      agentName: m.agentName,
      content: m.content,
      createdAt: m.createdAt,
    })) : [];

    let fullResponse = "";

    const unsub = agentEntry.server.session.subscribe((evt) => {
      const ev = evt as any;
      if (evt.type === "message_update") {
        if (ev.assistantMessageEvent?.type === "text_delta") {
          const delta = ev.assistantMessageEvent.delta;
          if (delta) {
            fullResponse += delta;
            broadcast("token", member.agentId, agentName, { delta, fullText: fullResponse });
          }
        } else if (ev.assistantMessageEvent?.type === "thinking_delta" && team.showThinking) {
          const delta = ev.assistantMessageEvent.delta;
          if (delta) broadcast("thinking", member.agentId, agentName, { delta });
        }
      } else if (evt.type === "tool_execution_start" && (team.showTools || ["request_approval", "ask_question"].includes(ev.toolName))) {
        broadcast("tool_start", member.agentId, agentName, { toolName: ev.toolName, args: ev.args }, ev.toolCallId);
      } else if (evt.type === "tool_execution_update" && (team.showTools || ["request_approval", "ask_question"].includes(ev.toolName))) {
        broadcast("tool_update", member.agentId, agentName, { toolName: ev.toolName, partialResult: ev.partialResult }, ev.toolCallId);
      } else if (evt.type === "tool_execution_end" && (team.showTools || ["request_approval", "ask_question"].includes(ev.toolName))) {
        broadcast("tool_end", member.agentId, agentName, { toolName: ev.toolName, result: ev.result, isError: ev.isError }, ev.toolCallId);
      }
    });

    try {
      agentEntry.server.session.sessionManager.syncChannelHistory(
        historyToSync as any,
        member.agentId,
        combinedPrefix
      );
      await activeContextStorage.run({ username, sessionId }, async () => {
        await agentEntry.server.session.continue();
      });
    } catch (err: any) {
      unsub();
      const isAbort = signal.aborted || err.message?.includes("abort") || err.message?.includes("cancel");
      if (!isAbort) {
        broadcast("agent_error", member.agentId, agentName, { error: String(err.message || err) });
      }
      return { agentMsg: null };
    } finally {
      unsub();
    }

    const parseResult = parseAgentResponse(agentEntry.server.session.messages, {} as any, fullResponse);

    if (memoryEnabled && userSettings.memoryAutoStore !== false && parseResult.content && !parseResult.isSilent) {
      await agentEntry.server.memory.store(
        parseResult.content.slice(0, 500),
        "episodic",
        0.5,
        ["interaction", `team:${team.id}`],
        sessionId
      );
    }

    if (parseResult.isSilent) return { agentMsg: null };

    const agentMsg: TeamMessage = {
      id: crypto.randomUUID(),
      role: "agent",
      content: parseResult.content,
      agentId: member.agentId,
      agentName,
      createdAt: new Date().toISOString(),
    };

    broadcast("turn_completed", member.agentId, agentName, { messageId: agentMsg.id, content: agentMsg.content });
    return { agentMsg };
  } finally {
    agentEntry.server.session.cwd = originalCwd;
  }
}
