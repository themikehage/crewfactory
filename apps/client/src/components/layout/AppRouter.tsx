import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { LoginPage } from "@/pages/LoginPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SkillsPage } from "@/pages/SkillsPage";
import { AgentsPage } from "@/pages/AgentsPage";
import { ChannelsPage } from "@/pages/ChannelsPage";
import { ChannelDetailPage } from "@/pages/ChannelDetailPage";
import { LogsConsolePage } from "@/pages/LogsConsolePage";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import { ChatArea } from "@/components/chat/ChatArea";
import { ChannelChatArea } from "@/components/channels/ChannelChatArea";
import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { DashboardPage } from "@/pages/DashboardPage";
import { useRouter } from "@/hooks/useRouter";
import { MainLayout } from "./MainLayout";

export function AppRouter() {
  const { token, user, loading } = useAuth();
  const { route, navigate } = useRouter();

  // Cargar el repo, agente o canal activo y el estado de contexto desde localStorage
  const [activeRepoId, setActiveRepoId] = useState<string | null>(() => {
    return localStorage.getItem("active-repo-id") || null;
  });

  const [activeRepoFriendlyName, setActiveRepoFriendlyName] = useState<string | null>(() => {
    return localStorage.getItem("active-repo-name") || null;
  });

  const [activeAgent, setActiveAgent] = useState<{ id: string; name: string } | null>(() => {
    try {
      const stored = localStorage.getItem("active-agent");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [activeChannel, setActiveChannel] = useState<{ id: string; name: string } | null>(() => {
    try {
      const stored = localStorage.getItem("active-channel");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [hasContext, setHasContext] = useState<boolean>(() => {
    return localStorage.getItem("has-context") === "true";
  });

  const handleSelectRepo = useCallback((repoId: string | null, repoName: string | null) => {
    if (repoId === null) {
      localStorage.removeItem("active-repo-id");
      localStorage.removeItem("active-repo-name");
    } else {
      localStorage.setItem("active-repo-id", repoId);
      localStorage.setItem("active-repo-name", repoName || "");
    }
    localStorage.removeItem("active-agent");
    localStorage.removeItem("active-channel");
    localStorage.setItem("has-context", "true");
    setActiveRepoId(repoId);
    setActiveRepoFriendlyName(repoName);
    setActiveAgent(null);
    setActiveChannel(null);
    setHasContext(true);
    // Redirigir a home/chat al cambiar de repositorio
    navigate("/");
  }, [navigate]);

  const handleSelectAgent = useCallback((agent: { id: string; name: string } | null) => {
    if (agent === null) {
      localStorage.removeItem("active-agent");
    } else {
      localStorage.setItem("active-agent", JSON.stringify(agent));
    }
    localStorage.removeItem("active-repo-id");
    localStorage.removeItem("active-repo-name");
    localStorage.removeItem("active-channel");
    localStorage.setItem("has-context", "true");
    setActiveAgent(agent);
    setActiveRepoId(null);
    setActiveRepoFriendlyName(null);
    setActiveChannel(null);
    setHasContext(true);
    navigate("/");
  }, [navigate]);

  const handleSelectChannel = useCallback((channel: { id: string; name: string } | null) => {
    if (channel === null) {
      localStorage.removeItem("active-channel");
    } else {
      localStorage.setItem("active-channel", JSON.stringify(channel));
    }
    localStorage.removeItem("active-repo-id");
    localStorage.removeItem("active-repo-name");
    localStorage.removeItem("active-agent");
    localStorage.setItem("has-context", "true");
    setActiveChannel(channel);
    setActiveRepoId(null);
    setActiveRepoFriendlyName(null);
    setActiveAgent(null);
    setHasContext(true);
    navigate("/");
  }, [navigate]);

  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-bg">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!token || !user) {
    return <LoginPage />;
  }

  // Si el usuario no tiene contexto, establecer modo global automáticamente
  if (!hasContext) {
    // handleSelectRepo(null, null);
  }

  return (
    <MainLayout
      route={route}
      onNavigate={navigate}
      activeRepoName={activeRepoFriendlyName}
      activeRepoId={activeRepoId}
      activeAgent={activeAgent}
      activeChannel={activeChannel}
      onSelectRepo={handleSelectRepo}
      onSelectAgent={handleSelectAgent}
      onSelectChannel={handleSelectChannel}
    >
      {route.page === "projects" && (
        <DashboardPage onNavigate={navigate} onSelectRepo={handleSelectRepo} />
      )}
      {route.page === "settings" && (
        <SettingsPage />
      )}
      {route.page === "skills" && (
        <SkillsPage />
      )}
      {route.page === "agents" && (
        <AgentsPage onSelectAgent={handleSelectAgent} />
      )}
      {route.page === "channels" && (
        <ChannelsPage onNavigate={navigate} onSelectChannel={handleSelectChannel} />
      )}
      {route.page === "logs" && (
        <LogsConsolePage
          onSelectRepo={handleSelectRepo}
          onSelectAgent={handleSelectAgent}
          onSelectChannel={handleSelectChannel}
          onNavigate={navigate}
        />
      )}
      {route.page === "channel" && (
        <ChannelDetailPage channelId={route.channelId} onNavigate={navigate} />
      )}
      {route.page === "workspace" && (
        <WorkspacePanel
          key={activeRepoId || activeAgent?.id || activeChannel?.id || "global"}
          activeRepoName={activeRepoId}
          activeAgentId={activeAgent?.id}
          activeChannelId={activeChannel?.id}
        />
      )}
      {route.page === "chat" && (
        activeChannel ? (
          <ChannelChatArea
            key={`${route.sessionId}-${activeChannel.id}`}
            activeChannel={activeChannel}
            sessionId={route.sessionId}
          />
        ) : (
          <ChatArea
            key={`${route.sessionId}-${activeRepoId}-${activeAgent?.id}`}
            sessionId={route.sessionId}
            activeRepoName={activeRepoId}
            activeAgent={activeAgent}
          />
        )
      )}
      {route.page === "preview" && (
        <PreviewPanel activeRepoName={activeRepoId} />
      )}
    </MainLayout>
  );
}
