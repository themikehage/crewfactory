import { useState, useEffect } from "react";
import { useTeam } from "@/hooks/useTeam";
import { TeamSessionsSidebar } from "@/components/teams/TeamSessionsSidebar";
import { TeamChatArea } from "@/components/teams/TeamChatArea";
import { useLiterals } from "@/lib";
import { literals as u } from "./TeamDetailPage.literals";

interface Props {
  teamId: string;
  onNavigate: (path: string) => void;
}

export function TeamDetailPage({ teamId, onNavigate }: Props) {
  const l = useLiterals(u);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    return localStorage.getItem(`active-team-session-${teamId}`) || null;
  });

  const { team, sessions, loading, createSession } = useTeam(teamId, activeSessionId);

  useEffect(() => {
    if (sessions.length > 0 && !activeSessionId) {
      const firstId = sessions[0].id;
      setActiveSessionId(firstId);
      localStorage.setItem(`active-team-session-${teamId}`, firstId);
    }
  }, [sessions, activeSessionId, teamId]);

  const handleSelectSession = (id: string) => {
    setActiveSessionId(id);
    localStorage.setItem(`active-team-session-${teamId}`, id);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-secondary text-xs bg-background">
        {l.loading}
      </div>
    );
  }

  if (!team) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-text-secondary text-xs gap-3 bg-background">
        <span>{l.teamNotFound}</span>
        <button
          onClick={() => onNavigate("/teams")}
          className="px-4 py-2 border border-input hover:bg-surface-hover hover:text-text-primary rounded-lg transition-colors cursor-pointer"
        >
          {l.back}
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex h-full overflow-hidden bg-background">
      <TeamSessionsSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onCreateSession={createSession}
      />
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        {activeSessionId ? (
          <TeamChatArea
            activeTeamId={teamId}
            sessionId={activeSessionId}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">
            Create or select a session to start.
          </div>
        )}
      </div>
    </div>
  );
}
