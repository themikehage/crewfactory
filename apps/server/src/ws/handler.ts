import jwt from "jsonwebtoken";
import { existsSync, readFileSync } from "node:fs";
import { piSessionManager } from "../pi/session-manager";
import type { AuthPayload } from "../middleware/auth";
import type { WSContext, WSMessageReceive } from "hono/ws";
import { setBuilding, setReady, setError, ensureWatcher } from "../pi/preview-watcher";
import { channelOrchestrator, setChannelBroadcastHandler } from "../channels";

function getRepoNameForSession(username: string, sessionId: string): string | undefined {
  const p = `/tmp/crewfactory/${username}/sessions/${sessionId}/metadata.json`;
  if (existsSync(p)) {
    try {
      return JSON.parse(readFileSync(p, "utf-8")).repoName;
    } catch {}
  }
}

interface PiWebSocket extends WSContext {
  wsId: string;
  user: AuthPayload;
}

let wsCounter = 0;
const userMap = new Map<string, AuthPayload>();
const wsSubscriptions = new Map<string, () => void>();
export const sessionSockets = new Map<string, Set<WSContext>>();
export const userSockets = new Map<string, Set<WSContext>>();
export const channelSockets = new Map<string, Set<WSContext>>();

export function broadcastToChannel(channelId: string, data: any) {
  const sockets = channelSockets.get(channelId);
  if (sockets) {
    const payload = JSON.stringify(data);
    for (const ws of sockets) {
      try {
        ws.send(payload);
      } catch {}
    }
  }
}

setChannelBroadcastHandler(broadcastToChannel);

export function broadcastToUser(username: string, data: any) {
  const sockets = userSockets.get(username);
  if (sockets) {
    const payload = JSON.stringify(data);
    for (const ws of sockets) {
      try {
        ws.send(payload);
      } catch {}
    }
  }
}

export function broadcastToSession(sessionId: string, data: any) {
  const sockets = sessionSockets.get(sessionId);
  if (sockets) {
    const payload = JSON.stringify(data);
    for (const ws of sockets) {
      try {
        ws.send(payload);
      } catch {}
    }
  }
}

function safeSend(ws: { send: (data: string) => void }, data: string) {
  try {
    ws.send(data);
  } catch {}
}

export function onOpen(_evt: Event, _ws: WSContext) {
  const ws = _ws as unknown as PiWebSocket;
  ws.wsId = String(++wsCounter);
}

export function onClose(_evt: any, _ws: WSContext) {
  const ws = _ws as unknown as PiWebSocket;
  const user = userMap.get(ws.wsId);
  userMap.delete(ws.wsId);
  // Clean from userSockets
  if (user) {
    const uSockets = userSockets.get(user.username);
    if (uSockets) {
      uSockets.delete(ws);
      if (uSockets.size === 0) {
        userSockets.delete(user.username);
      }
    }
  }
  // Clean from sessionSockets
  for (const [sessionId, wsSet] of sessionSockets.entries()) {
    if (wsSet.has(ws)) {
      wsSet.delete(ws);
      if (wsSet.size === 0) {
        sessionSockets.delete(sessionId);
      }
    }
  }
  // Clean from channelSockets
  for (const [channelId, wsSet] of channelSockets.entries()) {
    if (wsSet.has(ws)) {
      wsSet.delete(ws);
      if (wsSet.size === 0) {
        channelSockets.delete(channelId);
      }
    }
  }
  const unsub = wsSubscriptions.get(ws.wsId);
  if (unsub) {
    unsub();
    wsSubscriptions.delete(ws.wsId);
  }
}

export async function onMessage(evt: MessageEvent<WSMessageReceive>, _ws: WSContext) {
  const ws = _ws as unknown as PiWebSocket;
  let data: Record<string, unknown>;

  if (typeof evt.data !== "string") {
    return;
  }

  try {
    data = JSON.parse(evt.data);
  } catch {
    return;
  }

  if (data.type === "auth") {
    try {
      const user = jwt.verify(
        data.token as string,
        process.env.JWT_SECRET!
      ) as AuthPayload;
      userMap.set(ws.wsId, user);

      let userSockSet = userSockets.get(user.username);
      if (!userSockSet) {
        userSockSet = new Set();
        userSockets.set(user.username, userSockSet);
      }
      userSockSet.add(ws);

      const sessionId = data.sessionId as string;
      if (sessionId) {
        // Clean up from other sessions first
        for (const [sid, wsSet] of sessionSockets.entries()) {
          wsSet.delete(ws);
          if (wsSet.size === 0) {
            sessionSockets.delete(sid);
          }
        }
        // Add to sessionSockets
        let wsSet = sessionSockets.get(sessionId);
        if (!wsSet) {
          wsSet = new Set();
          sessionSockets.set(sessionId, wsSet);
        }
        wsSet.add(ws);

        const existingUnsub = wsSubscriptions.get(ws.wsId);
        if (existingUnsub) {
          existingUnsub();
        }

        if (sessionId.startsWith("exec_") || sessionId.startsWith("lab_")) {
          safeSend(ws, JSON.stringify({ type: "auth_success", wsId: ws.wsId }));
          return;
        }

        const session = await piSessionManager.getOrCreateSession(
          user.username,
          sessionId
        );

        const BUILD_REGEX = /\b(build|vite build|next build|nuxt build|astro build|bun run build|npm run build|pnpm run build|yarn build|tsc|webpack|parcel build|rollup -c)\b/;
        const sessionRepoName = getRepoNameForSession(user.username, sessionId);
        let hadBuildInSession = false;

        const unsub = session.subscribe((agentEvent) => {
          safeSend(ws, JSON.stringify(agentEvent));

          if (agentEvent.type === "tool_execution_start") {
            const ev = agentEvent as any;
            const cmd = ev.args?.command as string | undefined;
            if (ev.toolName === "bash" && cmd && BUILD_REGEX.test(cmd) && sessionRepoName) {
              hadBuildInSession = true;
              setBuilding(user.username, sessionRepoName);
            }
          }

          if (agentEvent.type === "tool_execution_end") {
            const ev = agentEvent as any;
            if (ev.toolName === "bash" && sessionRepoName) {
              const cmd = ev.args?.command as string | undefined;
              if (ev.isError) {
                const resultStr = typeof ev.result === "string" ? ev.result : JSON.stringify(ev.result).slice(0, 500);
                setError(user.username, sessionRepoName, resultStr || "Build failed");
                hadBuildInSession = false;
              } else if (cmd && BUILD_REGEX.test(cmd)) {
                hadBuildInSession = false;
                setReady(user.username, sessionRepoName);
              }
            }
          }

          if (agentEvent.type === "agent_end" && sessionRepoName && hadBuildInSession) {
            ensureWatcher(user.username, sessionRepoName);
            hadBuildInSession = false;
          }

          const sendContextUsage = () => {
            try {
              const contextUsage = session.getContextUsage();
              const sessionStats = session.getSessionStats();
              if (contextUsage || sessionStats) {
                safeSend(ws, JSON.stringify({
                  type: "context_usage",
                  sessionId,
                  contextUsage,
                  sessionStats,
                }));
              }
            } catch {}
          };

          if (agentEvent.type === "agent_start") {
            broadcastToUser(user.username, { type: "session_status", sessionId, status: "streaming" });
            sendContextUsage();
          }
          if (agentEvent.type === "agent_end") {
            broadcastToUser(user.username, { type: "session_status", sessionId, status: "active" });
            sendContextUsage();
          }
          if (agentEvent.type === "message_end") {
            sendContextUsage();
          }
        });
        wsSubscriptions.set(ws.wsId, unsub);
      }

      safeSend(ws, JSON.stringify({ type: "auth_success", wsId: ws.wsId }));
    } catch {
      safeSend(ws, JSON.stringify({ type: "auth_error", error: "Invalid token" }));
      try { ws.close(); } catch {}
    }
    return;
  }

  const user = userMap.get(ws.wsId);
  if (!user) {
    safeSend(ws, JSON.stringify({ type: "error", error: "Not authenticated" }));
    return;
  }

  if (data.type === "prompt") {
    const sessionId = data.sessionId as string;
    const message = data.message as string;
    const tools = data.tools as string[] | undefined;
    const images = data.images as any[] | undefined;

    if (sessionId && sessionId.startsWith("exec_")) {
      safeSend(
        ws,
        JSON.stringify({ type: "agent_error", sessionId, error: "Esta sesión de ejecución es de solo lectura y no acepta prompts." })
      );
      return;
    }

    const session = await piSessionManager.getOrCreateSession(
      user.username,
      sessionId
    );

    if (tools && Array.isArray(tools)) {
      session.setActiveToolsByName(tools);
    }

    if (session.isStreaming) {
      try {
        await session.prompt(message, { streamingBehavior: "followUp", images });
      } catch (error) {
        safeSend(
          ws,
          JSON.stringify({ type: "agent_error", sessionId, error: String(error) })
        );
      }
      return;
    }

    const { modelRegistry } = piSessionManager.getUserContext(user.username);
    if (!session.model || !modelRegistry.hasConfiguredAuth(session.model)) {
      const available = modelRegistry.getAvailable();
      if (available.length > 0) {
        try {
          await session.setModel(available[0]);
        } catch (error) {
          safeSend(
            ws,
            JSON.stringify({ type: "agent_error", sessionId, error: String(error) })
          );
          return;
        }
      } else {
        safeSend(
          ws,
          JSON.stringify({
            type: "agent_error",
            sessionId,
            error: "No providers configured. Go to Settings to add an API key.",
          })
        );
        return;
      }
    }

    try {
      await session.prompt(message, { images });
    } catch (error) {
      safeSend(
        ws,
        JSON.stringify({ type: "agent_error", sessionId, error: String(error) })
      );
    }
  }

  if (data.type === "steer") {
    const sessionId = data.sessionId as string;
    const message = data.message as string;
    const session = piSessionManager.getSession(user.username, sessionId);
    if (session) {
      session.steer(message);
    }
  }

  if (data.type === "follow_up") {
    const sessionId = data.sessionId as string;
    const message = data.message as string;
    const session = piSessionManager.getSession(user.username, sessionId);
    if (session) {
      session.followUp(message);
    }
  }

  if (data.type === "abort") {
    const sessionId = data.sessionId as string;
    const session = piSessionManager.getSession(user.username, sessionId);
    if (session) {
      await session.abort();
      safeSend(ws, JSON.stringify({ type: "aborted", sessionId }));
    }
  }

  if (data.type === "compact") {
    const sessionId = data.sessionId as string;
    const session = piSessionManager.getSession(user.username, sessionId);
    if (session) {
      await session.compact();
    }
  }

  if (data.type === "get_context_usage") {
    const sessionId = data.sessionId as string;
    const session = piSessionManager.getSession(user.username, sessionId);
    if (session) {
      const contextUsage = session.getContextUsage();
      const sessionStats = session.getSessionStats();
      safeSend(ws, JSON.stringify({ type: "context_usage", sessionId, contextUsage, sessionStats }));
    }
  }

  if (data.type === "channel_join") {
    const channelId = data.channelId as string;
    if (channelId) {
      // Remove from existing channelSockets
      for (const [cid, wsSet] of channelSockets.entries()) {
        wsSet.delete(ws);
        if (wsSet.size === 0) channelSockets.delete(cid);
      }
      let wsSet = channelSockets.get(channelId);
      if (!wsSet) {
        wsSet = new Set();
        channelSockets.set(channelId, wsSet);
      }
      wsSet.add(ws);
      safeSend(ws, JSON.stringify({ type: "channel_joined", channelId }));
    }
  }

  if (data.type === "channel_send") {
    const channelId = data.channelId as string;
    const message = data.message as string;
    const sessionId = data.sessionId as string | undefined;
    if (channelId && message) {
      channelOrchestrator.dispatchUserMessage(user.username, channelId, message, sessionId).catch((err) => {
        console.error(`[WS] Error dispatching channel message:`, err);
      });
    }
  }

  if (data.type === "channel_abort") {
    const channelId = data.channelId as string;
    const sessionId = data.sessionId as string | undefined;
    if (channelId) {
      channelOrchestrator.abortDispatch(user.username, channelId, sessionId);
    }
  }

  if (data.type === "llm_request") {
    const requestId = data.requestId as string;
    const prompt = data.prompt as string;
    const systemPrompt = data.systemPrompt as string | undefined;
    const model = data.model as string | undefined;

    console.log(`[WS Server] Received llm_request. requestId=${requestId}, model=${model}`);

    if (!requestId || !prompt) {
      console.log(`[WS Server] llm_request missing prompt/requestId. requestId=${requestId}`);
      safeSend(ws, JSON.stringify({ type: "llm_error", requestId, error: "Missing requestId or prompt" }));
      return;
    }

    const tempSessionId = `llm_${requestId}_${crypto.randomUUID()}`;
    console.log(`[WS Server] Creating temp session tempSessionId=${tempSessionId}`);

    try {
      const session = await piSessionManager.getOrCreateSession(user.username, tempSessionId);

      if (model) {
        try {
          console.log(`[WS Server] Setting model=${model} for temp session`);
          const { modelRegistry } = piSessionManager.getUserContext(user.username);
          let resolvedModel: any = null;
          if (model.includes("/")) {
            const [providerId, modelId] = model.split("/");
            resolvedModel = modelRegistry.find(providerId, modelId);
          } else {
            resolvedModel = modelRegistry.getAvailable().find(m => m.id === model);
          }

          if (resolvedModel) {
            await session.setModel(resolvedModel);
            console.log(`[WS Server] Successfully set model=${resolvedModel.provider}/${resolvedModel.id}`);
          } else {
            throw new Error(`Model ${model} not found in registry`);
          }
        } catch (e) {
          console.error(`[WS Server] Failed to set model for temp session`, e);
          safeSend(ws, JSON.stringify({ type: "llm_error", requestId, error: `Failed to set model: ${e}` }));
          await piSessionManager.destroySession(user.username, tempSessionId);
          return;
        }
      }

      const { modelRegistry } = piSessionManager.getUserContext(user.username);
      if (!session.model || !modelRegistry.hasConfiguredAuth(session.model)) {
        const available = modelRegistry.getAvailable();
        if (available.length > 0) {
          try {
            console.log(`[WS Server] Fallback to available[0]=${available[0].provider}/${available[0].id}`);
            await session.setModel(available[0]);
          } catch (e) {
            console.error(`[WS Server] Failed to set fallback model`, e);
            safeSend(ws, JSON.stringify({ type: "llm_error", requestId, error: `No model configured: ${e}` }));
            await piSessionManager.destroySession(user.username, tempSessionId);
            return;
          }
        } else {
          console.log(`[WS Server] No available providers configured`);
          safeSend(ws, JSON.stringify({ type: "llm_error", requestId, error: "No providers configured. Go to Settings to add an API key." }));
          await piSessionManager.destroySession(user.username, tempSessionId);
          return;
        }
      }

      const unsub = session.subscribe((evt: any) => {
        if (evt.type === "message_update") {
          const delta = evt.assistantMessageEvent;
          if (delta?.type === "text_delta" && delta.delta) {
            safeSend(ws, JSON.stringify({ type: "llm_delta", requestId, text: delta.delta }));
          }
        }
      });

      try {
        const finalPrompt = systemPrompt ? `${systemPrompt}\n\n---\n\n${prompt}` : prompt;
        console.log(`[WS Server] Starting prompt execution for tempSessionId=${tempSessionId}`);
        await session.prompt(finalPrompt);
        console.log(`[WS Server] Finished prompt execution for tempSessionId=${tempSessionId}`);

        let rawResult = "";
        const msgs = [...session.messages].reverse() as any[];
        const lastMsg = msgs.find((m: any) => m.role === "assistant");
        if (lastMsg) {
          if (typeof lastMsg.content === "string") rawResult = lastMsg.content;
          else if (Array.isArray(lastMsg.content)) {
            rawResult = lastMsg.content.map((c: any) => c.text || "").join("\n");
          }
        }

        console.log(`[WS Server] Sending llm_complete. result length=${rawResult.length}`);
        safeSend(ws, JSON.stringify({ type: "llm_complete", requestId, result: rawResult.trim() }));
      } catch (e) {
        console.error(`[WS Server] Prompt execution failed for tempSessionId=${tempSessionId}`, e);
        safeSend(ws, JSON.stringify({ type: "llm_error", requestId, error: String(e) }));
      } finally {
        unsub();
        await piSessionManager.destroySession(user.username, tempSessionId);
      }
    } catch (e) {
      console.error(`[llm_request] Fatal error for requestId ${requestId}:`, e);
      safeSend(ws, JSON.stringify({ type: "llm_error", requestId, error: String(e) }));
    }
  }
}
