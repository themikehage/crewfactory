import type { WSContext, WSMessageReceive } from "hono/ws";
import { wsRegistry } from "./registry";
import { wsLogger } from "./logger";
import {
  resolveUsernameFromCookieHeader,
  resolveUsernameFromToken,
  validateSessionFromHeaders,
} from "../lib/auth-helpers";
import type { AuthPayload } from "../middleware/auth";
import { existsSync, readFileSync } from "node:fs";
import { sessionManager } from "../core/session-manager";
import { SessionPrefix, getSessionMetadataPath } from "shared";
import { setBuilding, setReady, setError, ensureWatcher } from "../core/preview-watcher";
import { ChannelBusyError, channelOrchestrator, channelStore } from "../channels";
import { uiApprovalRegistry } from "../core/ui-approval-registry";
import { approvalManager } from "../core/approvals/approval-manager";

function getProjectNameForSession(username: string, sessionId: string): string | undefined {
  const p = getSessionMetadataPath(username, sessionId);
  if (existsSync(p)) {
    try {
      return JSON.parse(readFileSync(p, "utf-8")).projectName;
    } catch {}
  }
}

function safeSend(ws: { send: (data: string) => void }, data: string): void {
  try {
    ws.send(data);
  } catch (err) {
    wsLogger.error("safeSend failed", { error: err });
  }
}

async function subscribeWsToSession(
  wsId: string,
  ws: WSContext,
  user: AuthPayload,
  sessionId: string
): Promise<void> {
  if (sessionId.startsWith(SessionPrefix.EXEC) || sessionId.startsWith(SessionPrefix.LAB)) {
    return;
  }

  const meta = wsRegistry.getMeta(wsId);
  if (meta?.channelId) {
    wsRegistry.removeChannelSocket(meta.channelId, ws);
    wsRegistry.updateMeta(wsId, { channelId: undefined });
  }
  if (meta?.sessionId && meta.sessionId !== sessionId) {
    wsRegistry.removeSessionSocket(meta.sessionId, ws);
  }

  wsRegistry.addSessionSocket(sessionId, ws);
  wsRegistry.updateMeta(wsId, { sessionId });

  const session = await sessionManager.getOrCreateSession(user.username, sessionId);

  const BUILD_REGEX =
    /\b(build|vite build|next build|nuxt build|astro build|bun run build|npm run build|pnpm run build|yarn build|tsc|webpack|parcel build|rollup -c)\b/;
  const sessionProjectName = getProjectNameForSession(user.username, sessionId);
  let hadBuildInSession = false;

  const unsub = session.subscribe((agentEvent) => {
    safeSend(ws, JSON.stringify(agentEvent));

    if (agentEvent.type === "tool_execution_start") {
      const ev = agentEvent as any;
      const cmd = ev.args?.command as string | undefined;
      if (ev.toolName === "bash" && cmd && BUILD_REGEX.test(cmd) && sessionProjectName) {
        hadBuildInSession = true;
        setBuilding(user.username, sessionProjectName);
      }
    }

    if (agentEvent.type === "tool_execution_end") {
      const ev = agentEvent as any;
      if (ev.toolName === "bash" && sessionProjectName) {
        const cmd = ev.args?.command as string | undefined;
        if (ev.isError) {
          const resultStr =
            typeof ev.result === "string" ? ev.result : JSON.stringify(ev.result).slice(0, 500);
          setError(user.username, sessionProjectName, resultStr || "Build failed");
          hadBuildInSession = false;
        } else if (cmd && BUILD_REGEX.test(cmd)) {
          hadBuildInSession = false;
          setReady(user.username, sessionProjectName);
        }
      }
    }

    if (agentEvent.type === "agent_end" && sessionProjectName && hadBuildInSession) {
      ensureWatcher(user.username, sessionProjectName);
      hadBuildInSession = false;
    }

    const sendContextUsage = () => {
      try {
        const contextUsage = session.getContextUsage();
        const sessionStats = session.getSessionStats();
        if (contextUsage || sessionStats) {
          safeSend(
            ws,
            JSON.stringify({
              type: "context_usage",
              sessionId,
              contextUsage,
              sessionStats,
            })
          );
        }
      } catch (err) {
        wsLogger.error("sendContextUsage callback failed", {
          wsId,
          error: err,
        });
      }
    };

    if (agentEvent.type === "agent_start") {
      const sockets = wsRegistry.userSockets.get(user.username);
      if (sockets) {
        const payload = JSON.stringify({
          type: "session_status",
          sessionId,
          status: "streaming",
        });
        for (const s of sockets) {
          try {
            s.send(payload);
          } catch {}
        }
      }
      sendContextUsage();
    }
    if (agentEvent.type === "agent_end") {
      const sockets = wsRegistry.userSockets.get(user.username);
      if (sockets) {
        const payload = JSON.stringify({
          type: "session_status",
          sessionId,
          status: "sleeping",
        });
        for (const s of sockets) {
          try {
            s.send(payload);
          } catch {}
        }
      }
      sendContextUsage();
    }
    if (agentEvent.type === "message_end") {
      sendContextUsage();
    }
  });

  wsRegistry.setUnsub(wsId, unsub);

  if (session.isStreaming) {
    safeSend(ws, JSON.stringify({ type: "agent_start" }));
  }

  try {
    const contextUsage = session.getContextUsage();
    const sessionStats = session.getSessionStats();
    if (contextUsage || sessionStats) {
      safeSend(
        ws,
        JSON.stringify({
          type: "context_usage",
          sessionId,
          contextUsage,
          sessionStats,
        })
      );
    }
  } catch (err) {
    wsLogger.error("subscribeWsToSession initial sendContextUsage failed", {
      wsId,
      error: err,
    });
  }
}

export interface WsConnectionContext {
  id: string;
  onOpen: (evt: Event, ws: WSContext, rawHeaders?: Headers | null) => Promise<void> | void;
  onMessage: (evt: MessageEvent<WSMessageReceive>, ws: WSContext) => Promise<void> | void;
  onClose: (evt: any, ws: WSContext) => void;
  getId: () => string;
}

export function createWsContext(): WsConnectionContext {
  const id = crypto.randomUUID();

  const onOpen = async (_evt: Event, ws: WSContext, rawHeaders?: Headers | null) => {
    wsRegistry.createMeta(id, ws);
    wsLogger.info("Connection opened", { wsId: id });

    try {
      if (!rawHeaders) {
        return;
      }

      const headersForValidation =
        rawHeaders instanceof Headers ? rawHeaders : new Headers(rawHeaders as any);
      let username: string | null = null;

      try {
        const validated = await validateSessionFromHeaders(headersForValidation);
        if (validated?.username) {
          username = validated.username;
        }
      } catch {}

      if (!username) {
        const cookieHeader =
          headersForValidation.get("Cookie") ?? headersForValidation.get("cookie") ?? null;
        if (cookieHeader) {
          username = resolveUsernameFromCookieHeader(cookieHeader);
        }
      }

      if (username) {
        wsLogger.info("Cookie auth success", { wsId: id, username });
        const user: AuthPayload = { username };
        wsRegistry.setUser(id, user);
        wsRegistry.addUserSocket(user.username, ws);
        safeSend(ws, JSON.stringify({ type: "auth_success", wsId: id }));
      }
    } catch (err) {
      wsLogger.error("Cookie auth error", { wsId: id, error: err });
    }
  };

  const onClose = (evt: any, _ws: WSContext) => {
    wsLogger.info(`Connection closed code=${evt?.code} reason=${evt?.reason ?? ""}`, {
      wsId: id,
    });
    const meta = wsRegistry.getMeta(id);
    const user = meta?.user ?? wsRegistry.getUser(id);

    if (user) {
      wsRegistry.removeUserSocket(user.username, meta?.ws ?? _ws);
    }

    if (meta?.sessionId) {
      wsRegistry.removeSessionSocket(meta.sessionId, meta.ws ?? _ws);
    }

    if (meta?.channelId) {
      wsRegistry.removeChannelSocket(meta.channelId, meta.ws ?? _ws);
    }

    wsRegistry.deleteMeta(id);
  };

  const onMessage = async (evt: MessageEvent<WSMessageReceive>, ws: WSContext) => {
    if (typeof evt.data !== "string") return;

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(evt.data);
    } catch {
      return;
    }

    try {
      if (data.type === "pong") {
        const meta = wsRegistry.getMeta(id);
        if (meta) {
          meta.missedPings = 0;
        }
        return;
      }

      if (data.type === "auth") {
        const sessionToken = (data.token as string) || "";
        wsLogger.info(
          `Auth request token prefix: ${sessionToken ? sessionToken.slice(0, 8) : "none"}...`,
          { wsId: id }
        );

        try {
          let username: string | null = null;
          if (sessionToken) {
            username = resolveUsernameFromToken(sessionToken);
          }

          if (!username) {
            wsLogger.warn("Auth failed - session token not found or expired", { wsId: id });
            const existingUser = wsRegistry.getUser(id);
            if (!existingUser) {
              safeSend(ws, JSON.stringify({ type: "auth_error", error: "Invalid session" }));
              try {
                ws.close();
              } catch {}
            }
            return;
          }

          wsLogger.info("Auth success", { wsId: id, username });
          const user: AuthPayload = { username };
          wsRegistry.setUser(id, user);
          wsRegistry.addUserSocket(user.username, ws);

          const sessionId = data.sessionId as string;
          if (sessionId) {
            wsLogger.info(`Auto-subscribing to sessionId: ${sessionId}`, { wsId: id });
            await subscribeWsToSession(id, ws, user, sessionId);
          }

          safeSend(ws, JSON.stringify({ type: "auth_success", wsId: id }));
        } catch (err: any) {
          wsLogger.error("Auth exception", { wsId: id, error: err });
          const existingUser = wsRegistry.getUser(id);
          if (!existingUser) {
            safeSend(ws, JSON.stringify({ type: "auth_error", error: "Invalid session" }));
            try {
              ws.close();
            } catch {}
          }
        }
        return;
      }

      const user = wsRegistry.getUser(id);
      if (!user) {
        wsLogger.warn(`Message type=${data.type} from unauthenticated`, { wsId: id });
        safeSend(ws, JSON.stringify({ type: "error", error: "Not authenticated" }));
        return;
      }

      if (data.type === "session_subscribe") {
        const sessionId = data.sessionId as string;
        if (!sessionId) return;
        wsLogger.info(`session_subscribe session=${sessionId}`, {
          wsId: id,
          username: user.username,
        });
        await subscribeWsToSession(id, ws, user, sessionId);
        safeSend(ws, JSON.stringify({ type: "session_subscribed", sessionId }));
        return;
      }

      if (data.type === "prompt") {
        const sessionId = data.sessionId as string;
        const message = data.message as string;
        const tools = data.tools as string[] | undefined;
        const images = data.images as any[] | undefined;

        wsLogger.info(`prompt session=${sessionId} len=${message?.length ?? 0}`, {
          wsId: id,
          username: user.username,
        });

        if (sessionId && sessionId.startsWith(SessionPrefix.EXEC)) {
          safeSend(
            ws,
            JSON.stringify({
              type: "agent_error",
              sessionId,
              error: "Esta sesion de ejecucion es de solo lectura y no acepta prompts.",
            })
          );
          return;
        }

        try {
          const existingMeta = wsRegistry.getMeta(id);
          if (!existingMeta?.sessionId || existingMeta.sessionId !== sessionId) {
            wsLogger.info(`Auto-subscribing on prompt session=${sessionId}`, { wsId: id });
            await subscribeWsToSession(id, ws, user, sessionId);
          }
        } catch (e) {
          wsLogger.error("Failed to auto-subscribe on prompt", { wsId: id, error: e });
        }

        const session = await sessionManager.getOrCreateSession(user.username, sessionId);

        if (tools && Array.isArray(tools)) {
          const currentActive = session.getActiveToolNames();

          const ALWAYS_ON = [
            "request_approval",
            "ask_question",
            "render_images",
            "render_html",
            "render_chart",
            "share_file",
            "refresh_ui",
            "spawn_subagent",
            "delegate_task",
            "decompose_tasks",
            "update_task_status",
            "complete_task_list",
            "vision",
            "generate_image",
            "manage_factory",
            "manage_custom_tools",
          ] as const;
          const BUILTIN_AND_ALWAYS = new Set<string>([
            "read",
            "write",
            "edit",
            "bash",
            "grep",
            "find",
            "ls",
            "exa_search",
            "web_fetch",
            ...ALWAYS_ON,
            "memory_store",
            "memory_recall",
            "memory_forget",
            "create_experiment",
          ]);

          const mcpActive = currentActive.filter((tName) => tName.startsWith("mcp_"));
          const memoryActive = currentActive.filter((tName) => tName.startsWith("memory_"));
          const exaActive = currentActive.filter((tName) => tName === "exa_search");
          const webFetchActive = currentActive.filter((tName) => tName === "web_fetch");
          const customActive = currentActive.filter(
            (tName) => !tName.startsWith("mcp_") && !tName.startsWith("memory_") && !BUILTIN_AND_ALWAYS.has(tName)
          );

          let enabledCustomFromStorage: string[] = [];
          try {
            const { customToolStorage } = await import("../core/custom-tools/storage");
            enabledCustomFromStorage = customToolStorage
              .loadAll(user.username)
              .filter((d: any) => d.enabled !== false)
              .map((d: any) => d.name);
          } catch {}

          const mergedCustom = Array.from(new Set([...customActive, ...enabledCustomFromStorage]));

          session.setActiveToolsByName(
            Array.from(
              new Set([
                ...tools,
                ...mcpActive,
                ...memoryActive,
                ...exaActive,
                ...webFetchActive,
                ...mergedCustom,
                ...ALWAYS_ON,
              ])
            )
          );
        }

        if (session.isStreaming) {
          try {
            session.followUp(message);
          } catch (error) {
            safeSend(ws, JSON.stringify({ type: "agent_error", sessionId, error: String(error) }));
          }
          return;
        }

        const { modelRegistry } = sessionManager.userConfig.getUserContext(user.username);
        if (!session.model || !modelRegistry.hasConfiguredAuth(session.model)) {
          const available = modelRegistry.getAvailable();
          if (available.length > 0) {
            try {
              await session.setModel(available[0]);
            } catch (error) {
              safeSend(ws, JSON.stringify({ type: "agent_error", sessionId, error: String(error) }));
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
          safeSend(ws, JSON.stringify({ type: "agent_error", sessionId, error: String(error) }));
        }
        return;
      }

      if (data.type === "steer") {
        const sessionId = data.sessionId as string;
        const message = data.message as string;
        const session = sessionManager.getSession(user.username, sessionId);
        if (session) session.steer(message);
        return;
      }

      if (data.type === "follow_up") {
        const sessionId = data.sessionId as string;
        const message = data.message as string;
        const session = sessionManager.getSession(user.username, sessionId);
        if (session) session.followUp(message);
        return;
      }

      if (data.type === "abort") {
        const sessionId = data.sessionId as string;
        const session = sessionManager.getSession(user.username, sessionId);
        if (session) {
          await session.abort();
          safeSend(ws, JSON.stringify({ type: "aborted", sessionId }));
        }
        return;
      }

      if (data.type === "compact") {
        const sessionId = data.sessionId as string;
        const session = sessionManager.getSession(user.username, sessionId);
        if (session) await session.compact();
        return;
      }

      if (data.type === "get_context_usage") {
        const sessionId = data.sessionId as string;
        const session = sessionManager.getSession(user.username, sessionId);
        if (session) {
          const contextUsage = session.getContextUsage();
          const sessionStats = session.getSessionStats();
          safeSend(
            ws,
            JSON.stringify({ type: "context_usage", sessionId, contextUsage, sessionStats })
          );
        }
        return;
      }

      if (data.type === "channel_join") {
        const channelId = data.channelId as string;
        if (!channelId) return;
        if (!channelStore.getChannel(user.username, channelId)) {
          safeSend(ws, JSON.stringify({ type: "channel_error", channelId, error: "Channel not found" }));
          return;
        }

        wsRegistry.clearUnsub(id);

        const meta = wsRegistry.getMeta(id);
        if (meta?.sessionId) {
          wsRegistry.removeSessionSocket(meta.sessionId, ws);
          wsRegistry.updateMeta(id, { sessionId: undefined });
        }
        if (meta?.channelId && meta.channelId !== channelId) {
          wsRegistry.removeChannelSocket(meta.channelId, ws);
        }
        wsRegistry.updateMeta(id, { channelId });
        wsRegistry.addChannelSocket(channelId, ws);
        safeSend(ws, JSON.stringify({ type: "channel_joined", channelId }));
        return;
      }

      if (data.type === "channel_send") {
        const channelId = data.channelId as string;
        const message = data.message as string;
        const sessionId = data.sessionId as string | undefined;
        if (channelId && message && channelStore.getChannel(user.username, channelId)) {
          channelOrchestrator
            .dispatchUserMessage(user.username, channelId, message, sessionId)
            .catch((err) => {
              if (err instanceof ChannelBusyError) {
                safeSend(ws, JSON.stringify({ type: "channel_error", channelId, sessionId, error: err.message, code: err.code, executionId: err.executionId }));
                return;
              }
              wsLogger.error("Error dispatching channel message", { error: err });
            });
        } else if (channelId) {
          safeSend(ws, JSON.stringify({ type: "channel_error", channelId, sessionId, error: "Channel not found" }));
        }
        return;
      }

      if (data.type === "channel_abort") {
        const channelId = data.channelId as string;
        const sessionId = data.sessionId as string | undefined;
        const executionId = data.executionId as string | undefined;
        if (channelId && channelStore.getChannel(user.username, channelId)) {
          channelOrchestrator.abortDispatch(user.username, channelId, sessionId, executionId);
        } else if (channelId) {
          safeSend(ws, JSON.stringify({ type: "channel_error", channelId, sessionId, error: "Channel not found" }));
        }
        return;
      }

      if (data.type === "benchmark_stop") {
        const channelId = data.channelId as string;
        if (channelId) {
          const { ChannelBenchmarkRunner } = await import("../laboratory/channel-benchmark-runner");
          await ChannelBenchmarkRunner.stopBenchmark(user.username, channelId);
        }
        return;
      }

      if (data.type === "approvals_get") {
        const pending = approvalManager.getAll(user.username);
        safeSend(ws, JSON.stringify({ type: "approvals_pending", items: pending }));
        return;
      }

      if (data.type === "ui_action") {
        const componentId = data.componentId as string;
        const action = data.action as string;
        const payload = data.payload as Record<string, any> | undefined;
        if (componentId && action) {
          const resolved = uiApprovalRegistry.resolve(componentId, { action, payload });
          if (resolved) {
            safeSend(ws, JSON.stringify({ type: "ui_action_acknowledged", componentId }));
          } else {
            safeSend(
              ws,
              JSON.stringify({
                type: "ui_action_error",
                componentId,
                error: "Approval request not found or already completed",
              })
            );
          }
        }
        return;
      }
    } catch (err) {
      wsLogger.error(`onMessage exception type=${(data as any)?.type}`, {
        wsId: id,
        error: err,
      });
      try {
        safeSend(
          ws,
          JSON.stringify({
            type: "agent_error",
            error: String(err),
            sessionId: (data as any)?.sessionId,
          })
        );
      } catch {}
    }
  };

  return {
    id,
    onOpen,
    onMessage,
    onClose,
    getId: () => id,
  };
}
