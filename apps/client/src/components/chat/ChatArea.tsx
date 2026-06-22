import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { MessageList } from "./MessageList";
import { InputArea } from "./InputArea";
import { TasksPanel } from "./TasksPanel";
import { AnimatePresence } from "framer-motion";
import type { Task, TaskRunnerState } from "shared";

const ALL_TOOL_NAMES = ["read", "write", "edit", "bash", "grep", "find", "ls"];

function getSandboxLabel(tools: string[]): { label: string; color: string } {
  const hasWrite = tools.includes("write") || tools.includes("edit") || tools.includes("bash");
  const hasRead = tools.includes("read") || tools.includes("grep") || tools.includes("find") || tools.includes("ls");
  if (tools.length === 0) return { label: "No Tools", color: "text-error" };
  if (!hasWrite && hasRead) return { label: "Read-Only", color: "text-warning" };
  if (tools.length === ALL_TOOL_NAMES.length) return { label: "Full Access", color: "text-success" };
  return { label: `${tools.length}/${ALL_TOOL_NAMES.length} Tools`, color: "text-accent" };
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
}

export function ChatArea({ sessionId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sandboxTools, setSandboxTools] = useState<string[]>(ALL_TOOL_NAMES);
  const [tasksPanelOpen, setTasksPanelOpen] = useState(false);
  const [tasksState, setTasksState] = useState<TaskRunnerState>({
    tasks: [],
    currentTaskId: null,
    status: "idle",
  });
  const { connected, send, subscribe } = useWebSocket(sessionId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const firstMessageSentRef = useRef(false);

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
      return;
    }
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
    }
  }, [sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
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

    const unsubError = subscribe("agent_error", (data: unknown) => {
      const evt = data as Record<string, unknown>;
      setError(String(evt.error ?? "Unknown error"));
    });

    const unsubTasks = subscribe("tasks_update", (data: any) => {
      if (data.state) {
        setTasksState(data.state);
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
    };
  }, [sessionId, subscribe]);

  const handleSend = useCallback(
    (message: string, option?: "steer" | "follow_up", tools?: string[]) => {
      if (!message.trim() || !sessionId) return;

      if (!firstMessageSentRef.current && option !== "steer" && option !== "follow_up") {
        firstMessageSentRef.current = true;
        const name = message.trim().slice(0, 50) + (message.trim().length > 50 ? "..." : "");
        window.dispatchEvent(
          new CustomEvent("renameSession", { detail: { sessionId, name } })
        );
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
        send({ type: "prompt", message, sessionId, tools });
      }
    },
    [sessionId, send]
  );

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
        setError(data.error || "Failed to switch conversation branch");
      }
    } catch (err) {
      setError(String(err));
    }
  }, [sessionId, loadMessages]);

  if (!sessionId) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary">
        <p>Select or create a session to start</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-row min-w-0 overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 h-full">
        <div className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 border-b border-surface text-xs text-text-secondary flex-shrink-0">
          <span
            className={`w-2 h-2 rounded-full ${connected ? "bg-success" : "bg-warning"}`}
          />
          {connected ? "Connected" : "Reconnecting..."}
          {streaming && <span className="ml-2 text-accent">Streaming...</span>}
          {tasksState.status !== "idle" && (
            <span className="ml-2 px-1.5 py-0.2 rounded bg-accent/15 text-accent font-semibold text-[10px]">
              Task Queue: {tasksState.status}
            </span>
          )}
          <span className="ml-auto flex items-center gap-3">
            <span className={`font-medium ${getSandboxLabel(sandboxTools).color}`}>
              {getSandboxLabel(sandboxTools).label}
            </span>
            <button
              onClick={() => setTasksPanelOpen(!tasksPanelOpen)}
              className={`px-2 py-0.5 border border-surface hover:border-accent hover:text-accent rounded cursor-pointer transition-colors text-[10px] sm:text-xs font-semibold ${
                tasksPanelOpen ? "text-accent border-accent bg-accent/10" : ""
              }`}
            >
              Tasks
            </button>
          </span>
        </div>
        {error && (
          <div className="px-3 sm:px-4 py-2 bg-error/10 border-b border-error/20 text-error text-xs flex-shrink-0">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="max-w-3xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
            <MessageList messages={messages} onNavigate={handleNavigate} sessionId={sessionId} />
            <div ref={messagesEndRef} />
          </div>
        </div>
        <InputArea
          onSend={handleSend}
          onAbort={handleAbort}
          streaming={streaming}
          sessionId={sessionId}
          onToolsChange={setSandboxTools}
          runnerActive={tasksState.status === "running" || tasksState.status === "decomposing"}
        />
      </div>

      <AnimatePresence>
        {tasksPanelOpen && (
          <TasksPanel
            tasksState={tasksState}
            onClose={() => setTasksPanelOpen(false)}
            onRun={handleRunTasks}
            onPause={handlePauseTasks}
            onReset={handleResetTasks}
            onDecompose={handleDecomposeTasks}
            onUpdateTasks={handleUpdateTasks}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
