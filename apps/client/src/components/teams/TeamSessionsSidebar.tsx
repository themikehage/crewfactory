import { useState } from "react";
import type { TeamSession } from "shared";

interface Props {
  sessions: TeamSession[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: (name: string) => Promise<TeamSession>;
}

export function TeamSessionsSidebar({ sessions, activeSessionId, onSelectSession, onCreateSession }: Props) {
  const [creating, setCreating] = useState(false);

  const handleNew = async () => {
    setCreating(true);
    try {
      const name = `Session ${sessions.length + 1}`;
      const sess = await onCreateSession(name);
      onSelectSession(sess.id);
    } catch {}
    setCreating(false);
  };

  return (
    <div className="flex flex-col h-full w-56 border-r border-white/[0.06] bg-bg shrink-0">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Sessions</span>
        <button
          onClick={handleNew}
          disabled={creating}
          className="w-5 h-5 rounded flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
          title="New session"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {sessions.length === 0 && (
          <div className="px-3 py-4 text-xs text-text-secondary text-center">No sessions yet</div>
        )}
        {sessions.map((sess) => (
          <button
            key={sess.id}
            onClick={() => onSelectSession(sess.id)}
            className={`w-full text-left px-3 py-2 text-xs transition-colors truncate ${
              activeSessionId === sess.id
                ? "bg-surface-hover text-text-primary"
                : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            }`}
          >
            {sess.name}
          </button>
        ))}
      </div>
    </div>
  );
}
