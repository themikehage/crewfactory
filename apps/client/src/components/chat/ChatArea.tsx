import { apiFetch } from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useChatScroll } from "@/hooks/useChatScroll";
import { useChatInputFocus } from "@/hooks/useChatInputFocus";
import { MessageList } from "./MessageList";
import { ChatInput, processAttachments } from "./ChatInput";
import { RightDrawer } from "./RightDrawer";
import { AnimatePresence } from "framer-motion";
import type { TaskRunnerState } from "shared";
import { useLiterals, type MessageUsage, type ContextUsage } from "@/lib";
import { literals as u } from "./ChatArea.literals";
import { useNavigate } from "react-router-dom";
import { WelcomeChatInput } from "./WelcomeChatInput";
import { useToast } from "@/contexts/ToastContext";
import { getSessionPath, getSessionName, buildCreateSessionBody, getSessionMeta } from "@/lib/session-utils";
import { FloatingTasks } from "./FloatingTasks";
import { SessionTimeline } from "./SessionTimeline";

const ALL_TOOL_NAMES = ["read", "write", "edit", "bash", "grep", "find", "ls"];

interface Message {
  role: "user" | "assistant" | "tool_result" | "toolResult" | "system" | "tool_approval_request";
  content: string | Array<{ type: string; text?: string; thinking?: string; name?: string; arguments?: Record<string, unknown> }>;
  toolName?: string;
  toolCallId?: string;
  args?: Record<string, any>;
  isError?: boolean;
  isStreaming?: boolean;
  api?: string;
  provider?: string;
  model?: string;
  usage?: MessageUsage;
  stopReason?: string;
  timestamp?: number;
  responseId?: string;
  id?: string;
  parentId?: string | null;
  siblings?: string[];
}

interface Props {
  sessionId: string | null;
  activeProjectName: string | null;
  activeAgent?: { id: string; name: string; avatarUrl?: string } | null;
  activeChannel?: { id: string; name: string } | null;
  activeTeam?: { id: string; name: string } | null;
}

export function ChatArea({ sessionId, activeProjectName, activeAgent = null, activeChannel = null, activeTeam = null }: Props) {
  const l = useLiterals(u);
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setSandboxTools] = useState<string[]>(ALL_TOOL_NAMES);
  const [serialTools, setSerialTools] = useState<string[]>(["request_approval", "ask_question"]);
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null);
  const [settledApprovals, setSettledApprovals] = useState<Record<string, "confirm" | "deny">>({});



  const createSessionAndSend = async (messageText: string, attachments?: File[]) => {
    const sessionName = getSessionName({ activeChannel, activeTeam, activeAgent, activeProjectName });

    try {
      let finalText = messageText;
      let imagesToSave: Array<{ type: "image"; data: string; mimeType: string }> = [];

      if (attachments && attachments.length > 0) {
        try {
          const result = await processAttachments(attachments, {
            activeProjectName,
            activeAgentId: activeAgent?.id,
            activeChannelId: activeChannel?.id});
          finalText = messageText + result.extraText;
          imagesToSave = result.images;
        } catch (attachErr) {
          addToast("error", attachErr instanceof Error ? attachErr.message : String(attachErr));
          return;
        }
      }

      const createRes = await apiFetch("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"},
        body: JSON.stringify(buildCreateSessionBody(sessionName, {
          activeChannel,
          activeTeam,
          activeAgent,
          activeProjectName}))});

      if (createRes.ok) {
        const session = await createRes.json();
        const path = getSessionPath(session.id, { activeChannel, activeTeam, activeAgent, activeProjectName });

        const pendingData = {
          text: finalText,
          images: imagesToSave.length > 0 ? imagesToSave : undefined,
          timestamp: Date.now()
        };

        (window as any).__pendingPrompts = (window as any).__pendingPrompts || {};
        (window as any).__pendingPrompts[session.id] = pendingData;

        try {
          localStorage.setItem(`pending-prompt-${session.id}`, JSON.stringify(pendingData));
        } catch (err) {
          console.error("Failed to store pending prompt in localStorage:", err);
        }

        navigate(path);
      } else {
        addToast("error", "Error al crear la sesión");
      }
    } catch (e) {
      console.error("Failed to auto-create session for prompt:", e);
      addToast("error", "Error inesperado al crear la sesión");
    }
  };

  const getSuggestions = () => {
    if (activeChannel) {
      return [
        {
          label: l.pillListAgents || "List Agents",
          promptText: l.pillListAgentsPrompt || "List all active programmatic agents and their roles."},
        {
          label: l.pillStartLab || "Start Experiment",
          promptText: l.pillStartLabPrompt || "Explain how to configure and run a debate experiment in the Laboratory."}
      ];
    }
    if (activeAgent) {
      return [
        {
          label: l.pillAgentRole || "Describe Role",
          promptText: l.pillAgentRolePrompt || "Explain your system prompt, context, and capabilities."}
      ];
    }
    if (activeProjectName) {
      return [
        {
          label: l.pillAnalyzeCode || "Analyze Workspace",
          promptText: l.pillAnalyzeCodePrompt || "Analyze the current repository structure and describe its architecture."},
        {
          label: l.pillRunTests || "Run Tests",
          promptText: l.pillRunTestsPrompt || "Run the project's test suite and report if any checks fail."}
      ];
    }
    return [
      {
        label: l.pillCreateRepo || "Create Repo",
        promptText: l.pillCreateRepoPrompt || "Help me create a new code repository."},
      {
        label: l.pillListAgents || "List Agents",
        promptText: l.pillListAgentsPrompt || "List all active programmatic agents and their roles."},
    ];
  };
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const [sessionMetadata, setSessionMetadata] = useState<any>(null);
  const [chatMode, setChatMode] = useState<"chat" | "timeline">("chat");
  const [tasksState, setTasksState] = useState<TaskRunnerState>({
    tasks: [],
    currentTaskId: null,
    status: "idle"});
  const [compacting, setCompacting] = useState(false);
  const { connected, send, subscribe } = useWebSocket(sessionId);
  const [wasConnected, setWasConnected] = useState(connected);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const firstMessageSentRef = useRef(false);
  const receivedMessageIds = useRef<Set<string>>(new Set());

  const handleCompact = useCallback(() => {
    if (!sessionId || compacting) return;
    setCompacting(true);
    send({ type: "compact", sessionId });
  }, [sessionId, send, compacting]);

  const { isReadOnly: isReadOnlyExecution, isChannelExecution } = getSessionMeta(sessionId);

  const {
    showScrollButton,
    scrollToBottom,
    handleScroll
  } = useChatScroll(scrollContainerRef, {
    messages,
    isStreaming: streaming
  });

  const chatInputRef = useChatInputFocus({
    sessionId,
    loadingMessages,
    streaming});

  const handleResolveApproval = useCallback((toolCallId: string, action: "confirm" | "deny") => {
    send({
      type: "ui_action",
      componentId: toolCallId,
      action});
    setSettledApprovals((prev) => ({ ...prev, [toolCallId]: action }));
  }, [send]);

  const handleToggleTasksStatus = useCallback(async (newStatus: "running" | "paused") => {
    if (!sessionId) return;
    try {
      const res = await apiFetch(`/api/sessions/${sessionId}/tasks/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"},
        body: JSON.stringify({ status: newStatus })});
      if (res.ok) {
        const data = await res.json();
        setTasksState(data);
      }
    } catch (e) {
      console.error("Failed to toggle task runner status:", e);
    }
  }, [sessionId]);

  const loadMessages = useCallback(async (silent = false) => {
    if (!sessionId) {
      setMessages([]);
      setLoadingMessages(false);
      setSessionMetadata(null);
      return;
    }
    if (!silent) {
      setLoadingMessages(true);
    }
    try {
      const res = await apiFetch(`/api/sessions/${sessionId}/messages`);
      if (res.ok) {
        const data = await res.json();
        const msgs = data.messages ?? [];
        setMessages(msgs);
        msgs.forEach((m: any) => {
          const id = m.responseId || m.id;
          if (id) {
            receivedMessageIds.current.add(id);
          }
        });
        setSessionMetadata(data.metadata ?? null);
        if (msgs.length > 0) {
          firstMessageSentRef.current = true;
        }
        scrollToBottom("instant");
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (!silent) {
        setLoadingMessages(false);
      }
    }
  }, [sessionId, scrollToBottom]);

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      setLoadingMessages(false);
      setContextUsage(null);
      return;
    }

    receivedMessageIds.current.clear();
    loadMessages();
    firstMessageSentRef.current = false;

    const fetchTools = async () => {
      try {
        const res = await apiFetch(`/api/sessions/${sessionId}/tools`);
        if (res.ok) {
          const data = await res.json();
          setSandboxTools(data.tools ?? ALL_TOOL_NAMES);
          setSerialTools(data.serialTools ?? ["request_approval", "ask_question"]);
        }
      } catch {}
    };
    fetchTools();

    const fetchTasks = async () => {
      try {
        const res = await apiFetch(`/api/sessions/${sessionId}/tasks`);
        if (res.ok) {
          const data = await res.json();
          setTasksState(data);
        }
      } catch {}
    };
    fetchTasks();

    const findMsgIndex = (prev: Message[], msg: Message) => {
      return prev.findIndex(m => 
        (m.id && msg.id && m.id === msg.id) || 
        (m.responseId && msg.responseId && m.responseId === msg.responseId)
      );
    };

    const hasContent = (c: any) => {
      if (!c) return false;
      if (typeof c === "string") return c.length > 0;
      if (Array.isArray(c)) return c.length > 0;
      return true;
    };

    const unsubStart = subscribe("agent_start", () => {
      setStreaming(true);
      setError(null);
    });

    const unsubEnd = subscribe("agent_end", () => {
      setStreaming(false);
      window.dispatchEvent(new CustomEvent("workspaceUpdated"));
    });

    const unsubMsgStart = subscribe("message_start", (data: unknown) => {
      const evt = data as Record<string, unknown>;
      const msg = evt.message as Message | undefined;
      if (!msg) return;
      if (msg.role === "user" && !(msg as any).details?.type) return;

      const msgId = msg.responseId || msg.id;
      if (msgId && receivedMessageIds.current.has(msgId)) {
        return;
      }
      if (msgId) {
        receivedMessageIds.current.add(msgId);
      }

      setMessages((prev) => {
        const index = findMsgIndex(prev, msg);
        if (index !== -1) {
          const existing = prev[index];
          const newContent = hasContent(msg.content) ? msg.content : existing.content;
          const updated = { ...existing, ...msg, content: newContent, isStreaming: true };
          const copy = [...prev];
          copy[index] = updated;
          return copy;
        }
        const last = prev[prev.length - 1];
        if (last?.isStreaming) {
          return [...prev.slice(0, -1), { ...msg, isStreaming: true }];
        }
        return [...prev, { ...msg, isStreaming: true }];
      });
    });

    const unsubMsg = subscribe("message_update", (data: unknown) => {
      const evt = data as Record<string, unknown>;
      const msg = evt.message as Message | undefined;
      if (!msg) return;

      setMessages((prev) => {
        const index = findMsgIndex(prev, msg);
        if (index !== -1) {
          const existing = prev[index];
          const updated = { ...existing, ...msg, isStreaming: true };
          const copy = [...prev];
          copy[index] = updated;
          return copy;
        }
        const last = prev[prev.length - 1];
        if (last?.isStreaming) {
          return [...prev.slice(0, -1), { ...msg, isStreaming: true }];
        }
        return [...prev, { ...msg, isStreaming: true }];
      });
    });

    const unsubMsgEnd = subscribe("message_end", (data: unknown) => {
      const evt = data as Record<string, unknown>;
      const msg = evt.message as Message | undefined;
      if (!msg) return;
      if (msg.role === "user" && !(msg as any).details?.type) return;

      setMessages((prev) => {
        const index = findMsgIndex(prev, msg);
        if (index !== -1) {
          const existing = prev[index];
          const updated = { ...existing, ...msg, isStreaming: false };
          const copy = [...prev];
          copy[index] = updated;
          return copy;
        }
        const last = prev[prev.length - 1];
        if (last?.isStreaming) {
          return [...prev.slice(0, -1), msg];
        }
        return [...prev, msg];
      });
      window.dispatchEvent(new CustomEvent("workspaceUpdated"));
    });

    const unsubToolEnd = subscribe("tool_execution_end", (data: unknown) => {
      const evt = data as Record<string, unknown>;
      const toolCallId = evt.toolCallId as string | undefined;
      if (!toolCallId) return;
      const result = evt.result as any;
      const isError = evt.isError as boolean | undefined;
      setMessages((prev) => {
        const alreadyExists = prev.some(
          m => (m.role === "tool_result" || m.role === "toolResult") && (m as any).toolCallId === toolCallId
        );
        if (alreadyExists) return prev;
        const toolResultMsg: any = {
          role: "toolResult",
          toolCallId,
          content: (result && typeof result === "object" && result.content)
            ? result.content
            : [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result || "") }],
          isError: !!isError,
          details: result?.details};
        return [...prev, toolResultMsg];
      });
    });

    const unsubError = subscribe("agent_error", (data: unknown) => {
      const evt = data as Record<string, unknown>;
      setError(String(evt.error ?? l.unknownError));
      setStreaming(false);
      setCompacting(false);
    });

    const unsubTasks = subscribe("tasks_update", (data: any) => {
      if (data.state) {
        setTasksState(data.state);
      }
    });

    const unsubSubagent = subscribe("subagent_event", (data: any) => {
      if (data && data.toolCallId && data.event) {
        window.dispatchEvent(new CustomEvent(`subagent-event-${data.toolCallId}`, { detail: data.event }));
      }
    });

    const unsubContext = subscribe("context_usage", (data: unknown) => {
      const evt = data as Record<string, unknown>;
      if (evt.contextUsage) {
        setContextUsage(evt.contextUsage as ContextUsage);
        setCompacting(false);
      }
    });

    const unsubToolUpdate = subscribe("tool_execution_update", (data: unknown) => {
      const evt = data as Record<string, unknown>;
      const toolCallId = evt.toolCallId as string | undefined;
      if (!toolCallId) return;
      window.dispatchEvent(new CustomEvent(`tool-update-${toolCallId}`, { detail: evt }));
    });

    const unsubToolApproval = subscribe("tool_approval_request", (data: any) => {
      setMessages((prev) => {
        if (prev.some(m => m.toolCallId === data.toolCallId)) return prev;
        const approvalMsg: Message = {
          role: "tool_approval_request" as any,
          toolCallId: data.toolCallId,
          toolName: data.toolName,
          content: data.reason || "Action requires approval",
          args: data.args,
          timestamp: Date.now()} as any;
        return [...prev, approvalMsg];
      });
    });

    return () => {
      unsubStart();
      unsubEnd();
      unsubMsgStart();
      unsubMsg();
      unsubMsgEnd();
      unsubToolEnd();
      unsubError();
      unsubTasks();
      unsubSubagent();
      unsubContext();
      unsubToolUpdate();
      unsubToolApproval();
    };
  }, [sessionId, subscribe, loadMessages, navigate, activeChannel, activeAgent, activeProjectName]);

  useEffect(() => {
    if (connected && !wasConnected && sessionId) {
      const timer = setTimeout(() => {
        loadMessages(true);
      }, 500);
      return () => clearTimeout(timer);
    }
    setWasConnected(connected);
  }, [connected, wasConnected, sessionId, loadMessages]);
  const handleSend = useCallback(
    (message: string, option?: "steer" | "follow_up", tools?: string[], images?: Array<{ type: "image"; data: string; mimeType: string }>) => {
      if (!message.trim() || !sessionId) return;

      scrollToBottom("instant");

      if (!firstMessageSentRef.current && option !== "steer" && option !== "follow_up") {
        firstMessageSentRef.current = true;
        const cleanName = message.trim();
        const name = cleanName.slice(0, 50) + (cleanName.length > 50 ? "..." : "");
        window.dispatchEvent(
          new CustomEvent("renameSession", { detail: { sessionId, name } })
        );
        apiFetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"},
          body: JSON.stringify({ name })}).catch(() => {});
      }

      if (option === "steer") {
        const userMsg: Message = { role: "user", content: `[Steer] ${message}` };
        setMessages((prev) => [...prev, userMsg]);
        send({ type: "steer", message, sessionId });
      } else if (option === "follow_up") {
        const userMsg: Message = { role: "user", content: `[Follow-up] ${message}` };
        setMessages((prev) => [...prev, userMsg]);
        send({ type: "follow_up", message, sessionId });
      } else {
        const userMsg: Message = { role: "user", content: message };
        setMessages((prev) => [...prev, userMsg]);
        if (activeChannel) {
          apiFetch(`/api/channels/${activeChannel.id}/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json"},
            body: JSON.stringify({ message })}).catch(() => {});
        } else {
          send({ type: "prompt", message, sessionId, tools, images });
        }
      }
    },
    [sessionId, send, activeChannel, scrollToBottom]
  );

  useEffect(() => {
    if (!sessionId) return;
    const pendingKey = `pending-prompt-${sessionId}`;
    const pendingImagesKey = `pending-images-${sessionId}`;

    // 1. Try memory
    let pending = (window as any).__pendingPrompts?.[sessionId];

    // 2. Try localStorage if memory was empty (e.g. F5)
    if (!pending) {
      const pendingStr = localStorage.getItem(pendingKey);
      if (pendingStr) {
        try {
          const parsed = JSON.parse(pendingStr);
          if (parsed && typeof parsed.timestamp === "number" && Date.now() - parsed.timestamp < 30000) {
            pending = parsed;
          }
        } catch (e) {
          // Fallback for legacy plain text prompt
          pending = {
            text: pendingStr,
            timestamp: Date.now()
          };
        }
      }
    }

    // Clean up memory
    if ((window as any).__pendingPrompts?.[sessionId]) {
      delete (window as any).__pendingPrompts[sessionId];
    }
    // Clean up localStorage keys (including legacy one)
    localStorage.removeItem(pendingKey);
    localStorage.removeItem(pendingImagesKey);

    if (pending && pending.text) {
      setTimeout(() => {
        handleSend(pending.text, undefined, undefined, pending.images);
      }, 500);
    }
  }, [sessionId, handleSend]);

  const handleAbort = useCallback(() => {
    send({ type: "abort", sessionId });
  }, [sessionId, send]);


  const handleNavigate = useCallback(async (targetId: string) => {
    if (!sessionId) return;
    try {
      const res = await apiFetch(`/api/sessions/${sessionId}/navigate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"},
        body: JSON.stringify({ targetId })});
      if (res.ok) {
        await loadMessages();
      } else {
        const data = await res.json();
        setError(data.error || l.branchError);
      }
    } catch (err) {
      setError(String(err));
    }
  }, [sessionId, loadMessages]);

  if (!sessionId) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-bg relative">
        <WelcomeChatInput
          title={activeChannel ? `#${activeChannel.name}` : activeAgent ? `${activeAgent.name}` : activeProjectName ? `${activeProjectName}` : undefined}
          sessionId={null}
          onSend={(msg, attachments) => createSessionAndSend(msg, attachments)}
          suggestions={getSuggestions()}
          showModelSelector={true}
          allowAttachments={!activeChannel}
          disabled={streaming || !connected}
          loading={streaming}
          textareaRef={chatInputRef}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-row min-w-0 overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        {sessionId && (
          <div className="px-4 py-2 bg-surface border-b border-border flex items-center justify-between flex-shrink-0 z-10">
            <div className="flex items-center gap-2 min-w-0">
              {sessionMetadata?.parentSessionId && (
                <button
                  onClick={() => navigate(getSessionPath(sessionMetadata.parentSessionId, { activeChannel, activeAgent, activeProjectName, activeTeam }))}
                  className="p-1 rounded-md hover:bg-card-hover text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
                  title="Volver a la sesión padre"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                </button>
              )}
              {sessionMetadata?.task ? (
                <span className="text-xs text-text-secondary truncate font-sans max-w-[200px] sm:max-w-[400px]" title={sessionMetadata.task}>
                  {sessionMetadata.task}
                </span>
              ) : (
                <span className="text-xs text-text-secondary truncate font-sans font-semibold">
                  {sessionMetadata?.name || "Active Session"}
                </span>
              )}
            </div>
            {messages.length > 0 && (
              <div className="flex items-center bg-card border border-input rounded-xl p-0.5 select-none shrink-0 shadow-xs">
                <button
                  onClick={() => setChatMode("chat")}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                    chatMode === "chat"
                      ? "bg-accent/15 text-accent font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Chat
                </button>
                <button
                  onClick={() => setChatMode("timeline")}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                    chatMode === "timeline"
                      ? "bg-accent/15 text-accent font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Timeline
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="px-3 sm:px-4 py-2 bg-destructive/10 border-b border-error/20 text-destructive text-xs flex-shrink-0">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
          </div>
        )}
        {!connected && (
          <div className="px-3 sm:px-4 py-1.5 bg-warning/10 border-b border-warning/20 text-warning text-xs flex-shrink-0 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
            Reconnecting... messages will be queued
          </div>
        )}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className={`flex-1 overflow-y-auto min-h-0 ${loadingMessages || messages.length === 0 ? "flex flex-col justify-center animate-fade-in" : ""}`}
        >
          {loadingMessages ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-text-secondary select-none">
              <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-mono tracking-wider animate-pulse opacity-85">Cargando mensajes...</span>
            </div>
          ) : (
            <div className={`max-w-3xl mx-auto px-3 sm:px-4 py-3 sm:py-4 w-full`}>
              {messages.length === 0 ? (
                <WelcomeChatInput
                  title={activeChannel ? `#${activeChannel.name}` : activeAgent ? `${activeAgent.name}` : activeProjectName ? `${activeProjectName}` : undefined}
                  sessionId={sessionId}
                  onSend={async (msg, attachments) => {
                    if (attachments && attachments.length > 0) {
                      const result = await processAttachments(attachments, { activeProjectName, activeAgentId: activeAgent?.id, activeChannelId: activeChannel?.id });
                      handleSend(msg + result.extraText, undefined, undefined, result.images.length > 0 ? result.images : undefined);
                    } else {
                      handleSend(msg);
                    }
                  }}
                  suggestions={getSuggestions()}
                  showModelSelector={true}
                  allowAttachments={!activeChannel}
                  disabled={streaming || !connected}
                  loading={streaming}
                  textareaRef={chatInputRef}
                />
              ) : (
                <>
                  <FloatingTasks
                    tasksState={tasksState}
                    onToggleStatus={handleToggleTasksStatus}
                  />
                  {chatMode === "timeline" ? (
                    <SessionTimeline
                      messages={messages}
                      sessionCreatedAt={sessionMetadata?.createdAt}
                    />
                  ) : (
                    <MessageList
                      messages={messages}
                      onNavigate={handleNavigate}
                      sessionId={sessionId}
                      activeProjectName={activeProjectName}
                      activeAgentId={activeAgent?.id}
                      activeAgentName={activeAgent?.name}
                      activeAgentAvatarUrl={activeAgent?.avatarUrl}
                      activeChannelId={activeChannel?.id}
                      activeTeamId={activeTeam?.id}
                      serialTools={serialTools}
                      onOpenSubagentConsole={(toolCallId: string, targetType?: string, targetId?: string) => {
                        const prefix = targetType === "delegate" || targetType === "channel" || targetType === "agent" || targetType === "project" || targetType === "session" ? "del" : "sub";
                        const subSessionId = `${prefix}_${toolCallId}`;

                        let context: any = { activeChannel, activeAgent, activeProjectName, activeTeam };

                        if (targetType && targetId) {
                          if (activeTeam) {
                            context = { activeTeam };
                          } else {
                            context = {
                              activeChannel: targetType === "channel" ? { id: targetId, name: "" } : null,
                              activeAgent: targetType === "agent" ? { id: targetId, name: "" } : null,
                              activeProjectName: targetType === "project" ? targetId : null,
                            };
                          }
                        }

                        navigate(getSessionPath(subSessionId, context));
                      }}
                      settledApprovals={settledApprovals}
                      onResolveApproval={handleResolveApproval}
                    />
                  )}
                  {!isReadOnlyExecution && <div className="h-[176px] flex-shrink-0" />}
                </>
              )}
            </div>
          )}
        </div>
        {showScrollButton && messages.length > 0 && (
          <button
            onClick={() => scrollToBottom("smooth")}
            className={`absolute ${isReadOnlyExecution ? "bottom-20" : "bottom-44"} left-1/2 -translate-x-1/2 z-20 flex items-center justify-center w-9 h-9 rounded-full bg-surface border border-border text-accent shadow-xl hover:bg-surface-hover active:scale-95 transition-all duration-200`}
          >
            <svg className="w-4 h-4 animate-bounce" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
        )}
        {messages.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 z-10">
            <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-t from-bg to-transparent pointer-events-none" />
            {isReadOnlyExecution ? (
              <div className="p-4 bg-card border-t border-input flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/25 text-purple-400 font-medium text-xs uppercase tracking-wider font-mono">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  {isChannelExecution ? "Ejecución CLI (Solo Lectura)" : "Ejecución de API (Solo Lectura)"}
                </div>
                <p className="text-[11px] text-center max-w-md font-sans">
                  Esta conversación corresponde a una ejecución automática externa. Podés navegar el historial de mensajes y tool calls, pero no es interactiva.
                </p>
              </div>
            ) : (
              <ChatInput
                onSend={handleSend}
                onAbort={handleAbort}
                streaming={streaming}
                sessionId={sessionId}
                onToolsChange={setSandboxTools}
                runnerActive={tasksState.status === "running" || tasksState.status === "decomposing"}
                activeProjectName={activeProjectName}
                activeAgentId={activeAgent?.id}
                activeChannelId={activeChannel?.id}
                contextUsage={contextUsage}
                onCompact={handleCompact}
                compacting={compacting}
                textareaRef={chatInputRef}
                disabled={!connected}
              />
            )}
          </div>
        )}

      </div>

      <AnimatePresence>
        {rightDrawerOpen && (
          <RightDrawer
            activeProjectName={activeProjectName}
            onClose={() => setRightDrawerOpen(false)}
            onSendPrompt={(prompt) => handleSend(prompt)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
