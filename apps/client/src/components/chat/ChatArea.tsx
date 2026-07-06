import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { MessageList } from "./MessageList";
import { InputArea } from "./InputArea";
import { RightDrawer } from "./RightDrawer";
import { ContextMeter } from "./ContextMeter";
import { AnimatePresence } from "framer-motion";
import type { Task, TaskRunnerState } from "shared";
import { useLiterals } from "@/lib";
import { literals as u } from "./ChatArea.literals";
import { useRouter } from "@/hooks/useRouter";
import { WelcomeChatInput } from "./WelcomeChatInput";

import { SubagentConsole } from "./tools/SubagentConsole";

const ALL_TOOL_NAMES = ["read", "write", "edit", "bash", "grep", "find", "ls"];

    function getSandboxLabel(tools: string[]): { label: string; color: string } {
      const coreTools = ALL_TOOL_NAMES;
      const activeCore = tools.filter(t => coreTools.includes(t));
      const hasWrite = activeCore.includes("write") || activeCore.includes("edit") || activeCore.includes("bash");
      const hasRead = activeCore.includes("read") || activeCore.includes("grep") || activeCore.includes("find") || activeCore.includes("ls");
      if (activeCore.length === 0) return { label: "No Tools", color: "text-destructive" };
      if (!hasWrite && hasRead) return { label: "Read-Only", color: "text-warning" };
      if (activeCore.length === coreTools.length) return { label: "Full Access", color: "text-primary" };
      return { label: `${activeCore.length}/${coreTools.length} Tools`, color: "text-primary" };
    }

interface MessageUsage {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  cost?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
}

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sandboxTools, setSandboxTools] = useState<string[]>(ALL_TOOL_NAMES);
  const [serialTools, setSerialTools] = useState<string[]>(["request_approval", "ask_question"]);

  const getSessionPath = useCallback((id: string) => {
    if (activeChannel) return `/channels/${activeChannel.id}/session/${id}`;
    if (activeAgent) return `/agents/${activeAgent.id}/session/${id}`;
    if (activeProjectName) return `/projects/${activeProjectName}/session/${id}`;
    return `/session/${id}`;
  }, [activeChannel, activeAgent, activeProjectName]);

  const createSessionAndSend = async (messageText: string) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    let sessionName = "Global Session";
    if (activeChannel) sessionName = `#${activeChannel.name} - Session`;
    else if (activeAgent) sessionName = `${activeAgent.name} - Session`;
    else if (activeProjectName) sessionName = `${activeProjectName} - Session`;

    try {
      const createRes = await fetch("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: sessionName,
          repoName: activeAgent || activeChannel ? undefined : activeProjectName || undefined,
          agentId: activeChannel ? undefined : activeAgent ? activeAgent.id : undefined,
          channelId: activeChannel ? activeChannel.id : undefined,
        }),
      });

      if (createRes.ok) {
        const session = await createRes.json();
        const path = getSessionPath(session.id);
        localStorage.setItem(`pending-prompt-${session.id}`, messageText);
        navigate(path);
      }
    } catch (e) {
      console.error("Failed to auto-create session for prompt:", e);
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
      {
        label: l.pillStartLab || "Start Experiment",
        promptText: l.pillStartLabPrompt || "Explain how to configure and run a debate experiment in the Laboratory.",
      }
    ];
  };
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const [subagentDrawer, setSubagentDrawer] = useState<{ toolCallId: string; task: string; role?: string } | null>(null);
  const [tasksState, setTasksState] = useState<TaskRunnerState>({
    tasks: [],
    currentTaskId: null,
    status: "idle",
  });
  const [contextData, setContextData] = useState<{
    contextUsage: { tokens: number | null; contextWindow: number | null; percent: number | null } | null;
    sessionStats: { tokens: { input: number; output: number; total: number } } | null;
  } | null>(null);
  const [activeObservers, setActiveObservers] = useState(0);
  const { connected, send, subscribe } = useWebSocket(sessionId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const firstMessageSentRef = useRef(false);

  const isReadOnlyExecution = sessionId?.startsWith("exec_") ?? false;
  const SCROLL_THRESHOLD = 50;

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const handleRunTasks = useCallback(async () => {
    if (!sessionId) return;
    try {
      const token = localStorage.getItem("token");
      await fetch(`/api/sessions/${sessionId}/tasks/run`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  }, [sessionId]);

  const handlePauseTasks = useCallback(async () => {
    if (!sessionId) return;
    try {
      const token = localStorage.getItem("token");
      await fetch(`/api/sessions/${sessionId}/tasks/pause`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  }, [sessionId]);

  const handleResetTasks = useCallback(async () => {
    if (!sessionId) return;
    try {
      const token = localStorage.getItem("token");
      await fetch(`/api/sessions/${sessionId}/tasks/reset`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {}
  }, [sessionId]);

  const handleDecomposeTasks = useCallback(async (objective: string) => {
    if (!sessionId) return;
    try {
      const token = localStorage.getItem("token");
      await fetch(`/api/sessions/${sessionId}/tasks/decompose`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ objective }),
      });
    } catch {}
  }, [sessionId]);

  const handleUpdateTasks = useCallback(async (updatedTasks: Task[]) => {
    if (!sessionId) return;
    try {
      const token = localStorage.getItem("token");
      await fetch(`/api/sessions/${sessionId}/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tasks: updatedTasks }),
      });
    } catch {}
  }, [sessionId]);

  const loadMessages = useCallback(async () => {
    if (!sessionId) {
      setMessages([]);
      setLoadingMessages(false);
      return;
    }
    setLoadingMessages(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/sessions/${sessionId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const msgs = data.messages ?? [];
        setMessages(msgs);
        if (msgs.length > 0) {
          firstMessageSentRef.current = true;
        }
        isAtBottomRef.current = true;
        scrollToBottom("instant");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMessages(false);
    }
  }, [sessionId, scrollToBottom]);

  useEffect(() => {
    if (isAtBottomRef.current) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      setLoadingMessages(false);
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

    const fetchContext = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/sessions/${sessionId}/context`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.contextUsage || data.sessionStats) {
            setContextData(data);
          }
        }
      } catch {}
    };
    fetchContext();

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

    const unsubError = subscribe("agent_error", (data: unknown) => {
      const evt = data as Record<string, unknown>;
      setError(String(evt.error ?? l.unknownError));
    });

    const unsubTasks = subscribe("tasks_update", (data: any) => {
      if (data.state) {
        setTasksState(data.state);
      }
    });

    const unsubCtx = subscribe("context_usage", (data: any) => {
      if (data.contextUsage || data.sessionStats) {
        setContextData({ contextUsage: data.contextUsage, sessionStats: data.sessionStats });
      }
    });

    const unsubSubagent = subscribe("subagent_event", (data: any) => {
      if (data && data.toolCallId && data.event) {
        window.dispatchEvent(new CustomEvent(`subagent-event-${data.toolCallId}`, { detail: data.event }));
      }
    });

    return () => {
      unsubStart();
      unsubEnd();
      unsubMsgStart();
      unsubMsg();
      unsubMsgEnd();
      unsubError();
      unsubTasks();
      unsubCtx();
      unsubSubagent();
    };
  }, [sessionId, subscribe]);
  const handleSend = useCallback(
    (message: string, option?: "steer" | "follow_up", tools?: string[], images?: Array<{ type: "image"; data: string; mimeType: string }>) => {
      if (!message.trim() || !sessionId) return;

      isAtBottomRef.current = true;

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
    [sessionId, send, activeChannel]
  );

  useEffect(() => {
    if (!sessionId) return;
    const pendingKey = `pending-prompt-${sessionId}`;
    const pendingPrompt = localStorage.getItem(pendingKey);
    if (pendingPrompt) {
      localStorage.removeItem(pendingKey);
      setTimeout(() => {
        handleSend(pendingPrompt);
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

  useEffect(() => {
    if (!sessionId) {
      setActiveObservers(0);
      return;
    }

    const checkObservers = async () => {
      try {
        const token = localStorage.getItem("token");
        const sessionsRes = await fetch("/api/sessions", {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!sessionsRes.ok) return;
        const { sessions } = await sessionsRes.json();
        const s = sessions.find((item: any) => item.id === sessionId);
        if (s && s.agentId) {
          const agentRes = await fetch(`/api/agents/${s.agentId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (agentRes.ok) {
            const data = await agentRes.json();
            setActiveObservers(data.activeObservers || 0);
            return;
          }
        }
        setActiveObservers(0);
      } catch {
        setActiveObservers(0);
      }
    };

    checkObservers();
    const interval = setInterval(checkObservers, 3000);
    return () => clearInterval(interval);
  }, [sessionId]);

  if (!sessionId) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-bg relative">
        <WelcomeChatInput
          title={activeChannel ? `#${activeChannel.name}` : activeAgent ? `${activeAgent.name}` : activeProjectName ? `${activeProjectName}` : undefined}
          sessionId={null}
          onSend={(msg) => createSessionAndSend(msg)}
          suggestions={getSuggestions()}
          showModelSelector={true}
          allowAttachments={false}
          disabled={streaming}
          loading={streaming}
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-row min-w-0 overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 h-full">
        <div className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 border-b border-border text-xs text-muted-foreground flex-shrink-0">
          <span
            className={`w-2 h-2 rounded-full ${connected ? "bg-primary" : "bg-warning"}`}
          />
          {connected ? l.connected : l.reconnecting}
          {streaming && <span className="ml-2 text-primary">Streaming...</span>}
          {activeObservers > 0 && (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-blue-400/10 text-blue-400 border border-blue-400/20 font-medium text-xs animate-pulse flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-blue-400" />
              Observado ({activeObservers})
            </span>
          )}
          {tasksState.status !== "idle" && (
            <span className="ml-2 px-1.5 py-0.2 rounded bg-primary/15 text-primary font-semibold text-xs">
              Task Queue: {tasksState.status}
            </span>
          )}
          <span className="ml-auto flex items-center gap-3">
            <span className={`font-medium ${getSandboxLabel(sandboxTools).color}`}>
              {getSandboxLabel(sandboxTools).label}
            </span>
            <button
              onClick={() => setRightDrawerOpen(!rightDrawerOpen)}
              className={`px-2 py-0.5 border border-border hover:border-primary hover:text-primary rounded cursor-pointer transition-colors text-xs sm:text-xs font-semibold ${
                rightDrawerOpen ? "text-primary border-primary bg-primary/10" : ""
              }`}
            >
              Ops & Tasks
            </button>
          </span>
        </div>
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
            <div className="max-w-3xl mx-auto px-3 sm:px-4 py-3 sm:py-4 w-full">
              {messages.length === 0 ? (
                <WelcomeChatInput
                  title={activeChannel ? `#${activeChannel.name}` : activeAgent ? `${activeAgent.name}` : activeProjectName ? `${activeProjectName}` : undefined}
                  sessionId={sessionId}
                  onSend={(msg) => handleSend(msg)}
                  suggestions={getSuggestions()}
                  showModelSelector={true}
                  allowAttachments={!activeChannel}
                  disabled={streaming}
                  loading={streaming}
                />
              ) : (
                <>
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
                    onOpenSubagentConsole={(toolCallId: string, task: string, role?: string) => {
                      setSubagentDrawer({ toolCallId, task, role });
                    }}
                  />
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>
          )}
        </div>
        {messages.length > 0 && !isReadOnlyExecution && (
          <ContextMeter
            contextUsage={contextData?.contextUsage ?? null}
            sessionStats={contextData?.sessionStats ?? null}
          />
        )}
        {messages.length > 0 && (
          isReadOnlyExecution ? (
            <div className="p-4 bg-card border-t border-input flex flex-col items-center justify-center gap-2 flex-shrink-0 text-muted-foreground">
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
            <InputArea
              onSend={handleSend}
              onAbort={handleAbort}
              streaming={streaming}
              sessionId={sessionId}
              onToolsChange={setSandboxTools}
              runnerActive={tasksState.status === "running" || tasksState.status === "decomposing"}
              activeProjectName={activeProjectName}
              activeAgentId={activeAgent?.id}
              activeChannelId={activeChannel?.id}
            />
          )
        )}
      </div>

      <AnimatePresence>
        {rightDrawerOpen && (
          <RightDrawer
            activeProjectName={activeProjectName}
            tasksState={tasksState}
            onClose={() => setRightDrawerOpen(false)}
            onRun={handleRunTasks}
            onPause={handlePauseTasks}
            onReset={handleResetTasks}
            onDecompose={handleDecomposeTasks}
            onUpdateTasks={handleUpdateTasks}
            onSendPrompt={(prompt) => handleSend(prompt)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {subagentDrawer && (
          <SubagentConsole
            parentId={sessionId}
            toolCallId={subagentDrawer.toolCallId}
            task={subagentDrawer.task}
            subagentRole={subagentDrawer.role}
            onClose={() => setSubagentDrawer(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
