import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { LoginPage } from "@/pages/LoginPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SkillsPage } from "@/pages/SkillsPage";
import { AgentsPage } from "@/pages/AgentsPage";
import { ChannelsPage } from "@/pages/ChannelsPage";
import { ChannelDetailPage } from "@/pages/ChannelDetailPage";
import { LogsConsolePage } from "@/pages/LogsConsolePage";
import { LaboratoryPage } from "@/pages/LaboratoryPage";
import { MCPMarketplacePage } from "@/pages/MCPMarketplacePage";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import { ChatArea } from "@/components/chat/ChatArea";
import { ChannelChatArea } from "@/components/channels/ChannelChatArea";
import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { DashboardPage } from "@/pages/DashboardPage";
import { useRouter } from "@/hooks/useRouter";
import { MainLayout } from "./MainLayout";
import { apiFetch } from "@/lib/api";
import type { Experiment } from "@/types/laboratory";

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

  // --- Estados de Laboratorio Elevados ---
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [isLabEditorOpen, setIsLabEditorOpen] = useState(false);
  const [editingLabExpId, setEditingLabExpId] = useState<string | null>(null);

  // Nuevos estados para controlar la ejecución y variantes de laboratorio
  const [isRunPromptModalOpen, setIsRunPromptModalOpen] = useState(false);
  const [runPromptValue, setRunPromptValue] = useState("");
  const [runningExpId, setRunningExpId] = useState<string | null>(null);
  const [activeVariantTab, setActiveVariantTab] = useState<"single" | "multiNoLeader" | "multiWithLeader">("single");

  const fetchExperiments = useCallback(async () => {
    try {
      const res = await apiFetch("/api/experiments");
      if (res.ok) {
        const data = await res.json();
        setExperiments(data.experiments || []);
      }
    } catch (e) {
      console.error("Failed to load experiments:", e);
    }
  }, []);

  const handleStopRun = useCallback(async (expId: string) => {
    try {
      await apiFetch(`/api/experiments/${expId}/stop`, { method: "POST" });
      fetchExperiments();
    } catch (e) {
      console.error("Failed to stop experiment:", e);
    }
  }, [fetchExperiments]);

  const handleConfirmRun = useCallback(async () => {
    if (!runningExpId) return;
    setIsRunPromptModalOpen(false);

    try {
      // 1. Actualizar el prompt de la tarea específica en el experimento
      const resPatch = await apiFetch(`/api/experiments/${runningExpId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskPrompt: runPromptValue })
      });

      if (!resPatch.ok) {
        throw new Error("Failed to update prompt");
      }

      const dataPatch = await resPatch.json();
      const updatedExp = dataPatch.experiment as Experiment;
      setExperiments((prev) => prev.map((e) => (e.id === updatedExp.id ? updatedExp : e)));

      // 2. Disparar ejecución
      await apiFetch(`/api/experiments/${runningExpId}/run`, { method: "POST" });
      fetchExperiments();
    } catch (e) {
      console.error("Failed to run experiment:", e);
    } finally {
      setRunningExpId(null);
    }
  }, [runningExpId, runPromptValue, fetchExperiments]);

  useEffect(() => {
    fetchExperiments();
  }, [fetchExperiments]);

  const handleDeleteExp = useCallback(async (expId: string) => {
    if (!window.confirm("¿Seguro que deseas eliminar este experimento de forma permanente?")) return;
    try {
      const res = await apiFetch(`/api/experiments/${expId}`, { method: "DELETE" });
      if (res.ok) {
        setExperiments((prev) => prev.filter((e) => e.id !== expId));
        if (route.page === "laboratory" && route.experimentId === expId) {
          navigate("/laboratory");
        }
      }
    } catch (e) {
      console.error("Failed to delete experiment:", e);
    }
  }, [route, navigate]);

  // Sincronizar estado y localStorage con los parámetros de la URL
  useEffect(() => {
    const routeRepo = "repoName" in route ? route.repoName : null;
    const routeAgent = "agentId" in route ? route.agentId : null;
    const routeChannel = "channelId" in route ? route.channelId : null;

    if (routeRepo && routeRepo !== activeRepoId) {
      localStorage.setItem("active-repo-id", routeRepo);
      localStorage.setItem("active-repo-name", routeRepo);
      localStorage.removeItem("active-agent");
      localStorage.removeItem("active-channel");
      localStorage.setItem("has-context", "true");
      setActiveRepoId(routeRepo);
      setActiveRepoFriendlyName(routeRepo);
      setActiveAgent(null);
      setActiveChannel(null);
      setHasContext(true);
    } else if (routeAgent && (!activeAgent || activeAgent.id !== routeAgent)) {
      const agentObj = { id: routeAgent, name: routeAgent };
      localStorage.setItem("active-agent", JSON.stringify(agentObj));
      localStorage.removeItem("active-repo-id");
      localStorage.removeItem("active-repo-name");
      localStorage.removeItem("active-channel");
      localStorage.setItem("has-context", "true");
      setActiveAgent(agentObj);
      setActiveRepoId(null);
      setActiveRepoFriendlyName(null);
      setActiveChannel(null);
      setHasContext(true);
    } else if (routeChannel && (!activeChannel || activeChannel.id !== routeChannel)) {
      const channelObj = { id: routeChannel, name: routeChannel };
      localStorage.setItem("active-channel", JSON.stringify(channelObj));
      localStorage.removeItem("active-repo-id");
      localStorage.removeItem("active-repo-name");
      localStorage.removeItem("active-agent");
      localStorage.setItem("has-context", "true");
      setActiveChannel(channelObj);
      setActiveRepoId(null);
      setActiveRepoFriendlyName(null);
      setActiveAgent(null);
      setHasContext(true);
    }
  }, [route, activeRepoId, activeAgent, activeChannel]);

  const handleSelectRepo = useCallback((repoId: string | null, repoName: string | null) => {
    if (repoId === null) {
      localStorage.removeItem("active-repo-id");
      localStorage.removeItem("active-repo-name");
      localStorage.removeItem("active-agent");
      localStorage.removeItem("active-channel");
      setActiveRepoId(null);
      setActiveRepoFriendlyName(null);
      setActiveAgent(null);
      setActiveChannel(null);
      setHasContext(false);
      navigate("/");
    } else {
      localStorage.setItem("active-repo-id", repoId);
      localStorage.setItem("active-repo-name", repoName || repoId);
      localStorage.removeItem("active-agent");
      localStorage.removeItem("active-channel");
      localStorage.setItem("has-context", "true");
      setActiveRepoId(repoId);
      setActiveRepoFriendlyName(repoName || repoId);
      setActiveAgent(null);
      setActiveChannel(null);
      setHasContext(true);
      navigate(`/repos/${repoId}/chat`);
    }
  }, [navigate]);

  const handleSelectAgent = useCallback((agent: { id: string; name: string } | null) => {
    if (agent === null) {
      localStorage.removeItem("active-agent");
      setActiveAgent(null);
      setHasContext(false);
      navigate("/");
    } else {
      localStorage.setItem("active-agent", JSON.stringify(agent));
      localStorage.removeItem("active-repo-id");
      localStorage.removeItem("active-repo-name");
      localStorage.removeItem("active-channel");
      localStorage.setItem("has-context", "true");
      setActiveAgent(agent);
      setActiveRepoId(null);
      setActiveRepoFriendlyName(null);
      setActiveChannel(null);
      setHasContext(true);
      navigate(`/agents/${agent.id}/chat`);
    }
  }, [navigate]);

  const handleSelectChannel = useCallback((channel: { id: string; name: string } | null) => {
    if (channel === null) {
      localStorage.removeItem("active-channel");
      setActiveChannel(null);
      setHasContext(false);
      navigate("/");
    } else {
      localStorage.setItem("active-channel", JSON.stringify(channel));
      localStorage.removeItem("active-repo-id");
      localStorage.removeItem("active-repo-name");
      localStorage.removeItem("active-agent");
      localStorage.setItem("has-context", "true");
      setActiveChannel(channel);
      setActiveRepoId(null);
      setActiveRepoFriendlyName(null);
      setActiveAgent(null);
      setHasContext(true);
      navigate(`/channels/${channel.id}/chat`);
    }
  }, [navigate]);

  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
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
      selectedExpId={route.page === "laboratory" && route.experimentId ? route.experimentId : null}
      experiments={experiments}
      onDeleteExperiment={handleDeleteExp}
      activeVariantTab={activeVariantTab}
      setActiveVariantTab={setActiveVariantTab}
      onRunExperiment={(id) => {
        const exp = experiments.find((e) => e.id === id);
        if (exp) {
          setRunningExpId(id);
          setRunPromptValue(exp.taskPrompt);
          setIsRunPromptModalOpen(true);
        }
      }}
      onStopExperiment={handleStopRun}
      onEditExperiment={(id) => {
        const exp = experiments.find((e) => e.id === id);
        if (exp) {
          setEditingLabExpId(id);
          setIsLabEditorOpen(true);
        }
      }}
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
      {route.page === "laboratory" && (
        <LaboratoryPage
          onNavigate={navigate}
          selectedExpId={route.page === "laboratory" && route.experimentId ? route.experimentId : null}
          setSelectedExpId={(id) => {
            if (id) navigate(`/laboratory/${id}`);
            else navigate("/laboratory");
          }}
          experiments={experiments}
          setExperiments={setExperiments}
          isEditorOpen={isLabEditorOpen}
          setIsEditorOpen={setIsLabEditorOpen}
          editingExpId={editingLabExpId}
          setEditingExpId={setEditingLabExpId}
          isRunPromptModalOpen={isRunPromptModalOpen}
          setIsRunPromptModalOpen={setIsRunPromptModalOpen}
          runPromptValue={runPromptValue}
          setRunPromptValue={setRunPromptValue}
          setRunningExpId={setRunningExpId}
          handleConfirmRun={handleConfirmRun}
          activeVariantTab={activeVariantTab}
          setActiveVariantTab={setActiveVariantTab}
        />
      )}
      {route.page === "mcps" && (
        <MCPMarketplacePage />
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
