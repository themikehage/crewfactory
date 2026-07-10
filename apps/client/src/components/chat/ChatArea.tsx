import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useChatScroll } from "@/hooks/useChatScroll";
import { MessageList } from "./MessageList";
import { ChatInput, processAttachments } from "./ChatInput";
import { RightDrawer } from "./RightDrawer";
import { AnimatePresence } from "framer-motion";
import type { TaskRunnerState } from "shared";
import { useLiterals, type MessageUsage, type ContextUsage } from "@/lib";
import { literals as u } from "./ChatArea.literals";
import { useRouter } from "@/hooks/useRouter";
import { WelcomeChatInput } from "./WelcomeChatInput";
import { useToast } from "@/contexts/ToastContext";

import { FloatingTasks } from "./FloatingTasks";

const ALL_TOOL_NAMES = ["read", "write", "edit", "bash", "grep", "find", "ls"];

interface Message {
  role: "user" | "assistant" | "tool_result" | "system";
  content: string | Array<{ type: string; text?: string; thinking?: string; name?: string; arguments?: Record<string, unknown> }>;
  toolName?: string;
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
}

export function ChatArea({ sessionId, activeProjectName, activeAgent = null, activeChannel = null }: Props) {
  const l = useLiterals(u);
  const { navigate } = useRouter();
  const { addToast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setSandboxTools] = useState<string[]>(ALL_TOOL_NAMES);
  const [serialTools, setSerialTools] = useState<string[]>(["request_approval", "ask_question"]);
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null);

  const getSessionPath = useCallback((id: string) => {
    if (activeChannel) return `/channels/${activeChannel.id}/session/${id}`;
    if (activeAgent) return `/agents/${activeAgent.id}/session/${id}`;
    if (activeProjectName) return `/projects/${activeProjectName}/session/${id}`;
    return `/session/${id}`;
  }, [activeChannel, activeAgent, activeProjectName]);

  const createSessionAndSend = async (messageText: string, attachments?: File[]) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    let sessionName = "Global Session";
    if (activeChannel) sessionName = `#${activeChannel.name} - Session`;
    else if (activeAgent) sessionName = `${activeAgent.name} - Session`;
    else if (activeProjectName) sessionName = `${activeProjectName} - Session`;

    try {
      let finalText = messageText;
      let imagesToSave: Array<{ type: "image"; data: string; mimeType: string }> = [];

      if (attachments && attachments.length > 0) {
        try {
          const result = await processAttachments(attachments, {
            activeProjectName,
            activeAgentId: activeAgent?.id,
            activeChannelId: activeChannel?.id,
          });
          finalText = messageText + result.extraText;
          imagesToSave = result.images;
        } catch (attachErr) {
          addToast("error", attachErr instanceof Error ? attachErr.message : String(attachErr));
          return;
        }
      }

      const createRes = await fetch("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: sessionName,
          projectName: activeAgent || activeChannel ? undefined : activeProjectName || undefined,
          agentId: activeChannel ? undefined : activeAgent ? activeAgent.id : undefined,
          channelId: activeChannel ? activeChannel.id : undefined,
        }),
      });

      if (createRes.ok) {
        const session = await createRes.json();
        const path = getSessionPath(session.id);

        localStorage.setItem(`pending-prompt-${session.id}`, finalText);
        if (imagesToSave.length > 0) {
          localStorage.setItem(`pending-images-${session.id}`, JSON.stringify(imagesToSave));
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
          promptText: l.pillListAgentsPrompt || "List all active programmatic agents and their roles.",
        },
        {
          label: l.pillStartLab || "Start Experiment",
          promptText: l.pillStartLabPrompt || "Explain how to configure and run a debate experiment in the Laboratory.",
        }
      ];
    }
    if (activeAgent) {
      return [
        {
          label: l.pillAgentRole || "Describe Role",
          promptText: l.pillAgentRolePrompt || "Explain your system prompt, context, and capabilities.",
        }
      ];
    }
    if (activeProjectName) {
      return [
        {
          label: l.pillAnalyzeCode || "Analyze Workspace",
          promptText: l.pillAnalyzeCodePrompt || "Analyze the current repository structure and describe its architecture.",
        },
        {
          label: l.pillRunTests || "Run Tests",
          promptText: l.pillRunTestsPrompt || "Run the project's test suite and report if any checks fail.",
        }
      ];
    }
    return [
      {
        label: l.pillCreateRepo || "Create Repo",
        promptText: l.pillCreateRepoPrompt || "Help me create a new code repository.",
      },
      {
        label: l.pillListAgents || "List Agents",
        promptText: l.pillListAgentsPrompt || "List all active programmatic agents and their roles.",
      },
    ];
  };
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const [sessionMetadata, setSessionMetadata] = useState<any>(null);
  const [tasksState, setTasksState] = useState<TaskRunnerState>({
    tasks: [],
    currentTaskId: null,
    status: "idle",
  });
  const { connected, send, subscribe } = useWebSocket(sessionId);
  const [wasConnected, setWasConnected] = useState(connected);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const firstMessageSentRef = useRef(false);

  const isReadOnlyExecution = sessionId?.startsWith("exec_") ?? false;

  const {
    showScrollButton,
    scrollToBottom,
    handleScroll
  } = useChatScroll(scrollContainerRef, {
    dependencies: [messages],
    isStreaming: streaming
  });



  const handleToggleTasksStatus = useCallback(async (newStatus: "running" | "paused") => {
    if (!sessionId) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/sessions/${sessionId}/tasks/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
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
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/sessions/${sessionId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const msgs = data.messages ?? [];
        setMessages(msgs);
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

    loadMessages();
    firstMessageSentRef.current = false;

    const fetchTools = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/sessions/${sessionId}/tools`, {
          headers: { Authorization: `Bearer ${token}` },
        });
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
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/sessions/${sessionId}/tasks`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setTasksState(data);
        }
      } catch {}
    };
    fetchTasks();

    const unsubStart = subscribe("agent_start", () => {
      setStreaming(true);
    });

    const unsubEnd = subscribe("agent_end", () => {
      setStreaming(false);
      window.dispatchEvent(new CustomEvent("workspaceUpdated"));
    });

    const unsubMsgStart = subscribe("message_start", (data: unknown) => {
      const evt = data as Record<string, unknown>;
      const msg = evt.message as Message | undefined;
      if (!msg) return;
      if (msg.role === "user") return;

      setMessages((prev) => {
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
      if (msg.role === "user") return;

      setMessages((prev) => {
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
          m => m.role === "tool_result" && (m as any).toolCallId === toolCallId
        );
        if (alreadyExists) return prev;
        const toolResultMsg: any = {
          role: "tool_result",
          toolCallId,
          content: (result && typeof result === "object" && result.content)
            ? result.content
            : [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result || "") }],
          isError: !!isError,
        };
        return [...prev, toolResultMsg];
      });
    });

    const unsubError = subscribe("agent_error", (data: unknown) => {
      const evt = data as Record<string, unknown>;
      setError(String(evt.error ?? l.unknownError));
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
      }
    });

    const unsubDelCompleted = subscribe("delegation_completed", (data: any) => {
      if (sessionId === data.parentSessionId) {
        loadMessages(true);
      }
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
      unsubDelCompleted();
    };
  }, [sessionId, subscribe, loadMessages, navigate, getSessionPath]);

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
        const token = localStorage.getItem("token");
        fetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ name }),
        }).catch(() => {});
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
          const token = localStorage.getItem("token");
          fetch(`/api/channels/${activeChannel.id}/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ message }),
          }).catch(() => {});
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
    const pendingPrompt = localStorage.getItem(pendingKey);
    const pendingImagesKey = `pending-images-${sessionId}`;
    const pendingImagesStr = localStorage.getItem(pendingImagesKey);
    let pendingImages: Array<{ type: "image"; data: string; mimeType: string }> | undefined = undefined;
    if (pendingImagesStr) {
      try {
        pendingImages = JSON.parse(pendingImagesStr);
      } catch (e) {
        console.error("Failed to parse pending images:", e);
      }
    }
    if (pendingPrompt) {
      localStorage.removeItem(pendingKey);
      localStorage.removeItem(pendingImagesKey);
      setTimeout(() => {
        handleSend(pendingPrompt, undefined, undefined, pendingImages);
      }, 500);
    }
  }, [sessionId, handleSend]);

  const handleAbort = useCallback(() => {
    send({ type: "abort", sessionId });
  }, [sessionId, send]);


  const handleNavigate = useCallback(async (targetId: string) => {
    if (!sessionId) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/sessions/${sessionId}/navigate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetId }),
      });
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
          disabled={streaming}
          loading={streaming}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-row min-w-0 overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        {(sessionId.startsWith("sub_") || sessionId.startsWith("del_")) && (
          <div className="px-4 py-2.5 bg-surface border-b border-border flex items-center justify-between flex-shrink-0 z-10">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-accent/15 border border-accent/30 text-accent font-medium text-[10px] font-mono uppercase tracking-wider">
                {sessionId.startsWith("sub_") ? "Subagent Session" : "Delegated Session"}
              </span>
            </div>
            {sessionMetadata?.parentSessionId && (
              <button
                onClick={() => navigate(getSessionPath(sessionMetadata.parentSessionId))}
                className="text-xs text-accent hover:underline flex items-center gap-1.5 transition-all duration-150 cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
                Volver a la Sesión Padre
              </button>
            )}
          </div>
        )}

        {error && (
          <div className="px-3 sm:px-4 py-2 bg-destructive/10 border-b border-error/20 text-destructive text-xs flex-shrink-0">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
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
                  disabled={streaming}
                  loading={streaming}
                />
              ) : (
                <>
                  <FloatingTasks
                    tasksState={tasksState}
                    onToggleStatus={handleToggleTasksStatus}
                  />
                  <MessageList
                    messages={messages}
                    onNavigate={handleNavigate}
                    sessionId={sessionId}
                    activeProjectName={activeProjectName}
                    activeAgentId={activeAgent?.id}
                    activeAgentName={activeAgent?.name}
                    activeAgentAvatarUrl={activeAgent?.avatarUrl}
                    activeChannelId={activeChannel?.id}
                    serialTools={serialTools}
                    onOpenSubagentConsole={(toolCallId: string) => {
                      navigate(getSessionPath(`sub_${toolCallId}`));
                    }}
                  />
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
                  {sessionId.includes("_channel_") ? "Ejecución CLI (Solo Lectura)" : "Ejecución de API (Solo Lectura)"}
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
