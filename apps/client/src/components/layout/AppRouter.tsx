import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
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
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    return localStorage.getItem("active-project-id") || null;
  });

  const [activeProjectFriendlyName, setActiveProjectFriendlyName] = useState<string | null>(() => {
    return localStorage.getItem("active-project-name") || null;
  });

  const [activeAgent, setActiveAgent] = useState<{ id: string; name: string; avatarUrl?: string } | null>(() => {
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
  const [activeVariantTab, setActiveVariantTab] = useState<"single" | "multiNoLeader" | "multiWithLeader" | "compare">("single");

  const [showDeleteExpConfirm, setShowDeleteExpConfirm] = useState(false);
  const [pendingDeleteExpId, setPendingDeleteExpId] = useState<string | null>(null);
  const [deletingExp, setDeletingExp] = useState(false);

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

  const handleStopRun = useCallback(async (id?: string) => {
    const targetId = id || runningExpId;
    if (!targetId) return;
    try {
      await apiFetch(`/api/experiments/${targetId}/stop`, { method: "POST" });
    } catch (e) {
      console.error("Failed to stop experiment:", e);
    } finally {
      setRunningExpId(null);
    }
  }, [runningExpId]);

  const handleJudgeExp = useCallback(async (id: string) => {
    try {
      const res = await apiFetch(`/api/experiments/${id}/judge`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setExperiments((prev) => prev.map((e) => (e.id === id ? data.experiment : e)));
      }
    } catch (e) {
      console.error("Failed to judge experiment:", e);
    }
  }, []);

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

  const executeDeleteExp = useCallback(async () => {
    if (!pendingDeleteExpId) return;
    setDeletingExp(true);
    try {
      const res = await apiFetch(`/api/experiments/${pendingDeleteExpId}`, { method: "DELETE" });
      if (res.ok) {
        setExperiments((prev) => prev.filter((e) => e.id !== pendingDeleteExpId));
        if (route.page === "laboratory" && route.experimentId === pendingDeleteExpId) {
          navigate("/laboratory");
        }
      }
    } catch (e) {
      console.error("Failed to delete experiment:", e);
    } finally {
      setDeletingExp(false);
      setShowDeleteExpConfirm(false);
      setPendingDeleteExpId(null);
    }
  }, [pendingDeleteExpId, route, navigate]);

  const handleDeleteExp = useCallback((expId: string) => {
    setPendingDeleteExpId(expId);
    setShowDeleteExpConfirm(true);
  }, []);

  // Sincronizar estado y localStorage con los parámetros de la URL
  useEffect(() => {
    const routeProject = "projectName" in route ? route.projectName : null;
    const routeAgent = "agentId" in route ? route.agentId : null;
    const routeChannel = "channelId" in route ? route.channelId : null;

    if (routeProject && routeProject !== activeProjectId) {
      localStorage.setItem("active-project-id", routeProject);
      localStorage.setItem("active-project-name", routeProject);
      localStorage.removeItem("active-agent");
      localStorage.removeItem("active-channel");
      localStorage.setItem("has-context", "true");
      setActiveProjectId(routeProject);
      setActiveProjectFriendlyName(routeProject);
      setActiveAgent(null);
      setActiveChannel(null);
      setHasContext(true);
    } else if (routeAgent && (!activeAgent || activeAgent.id !== routeAgent)) {
      const agentObj = { id: routeAgent, name: routeAgent };
      localStorage.setItem("active-agent", JSON.stringify(agentObj));
      localStorage.removeItem("active-project-id");
      localStorage.removeItem("active-project-name");
      localStorage.removeItem("active-channel");
      localStorage.setItem("has-context", "true");
      setActiveAgent(agentObj);
      setActiveProjectId(null);
      setActiveProjectFriendlyName(null);
      setActiveChannel(null);
      setHasContext(true);
    } else if (routeChannel && (!activeChannel || activeChannel.id !== routeChannel)) {
      const channelObj = { id: routeChannel, name: routeChannel };
      localStorage.setItem("active-channel", JSON.stringify(channelObj));
      localStorage.removeItem("active-project-id");
      localStorage.removeItem("active-project-name");
      localStorage.removeItem("active-agent");
      localStorage.setItem("has-context", "true");
      setActiveChannel(channelObj);
      setActiveProjectId(null);
      setActiveProjectFriendlyName(null);
      setActiveAgent(null);
      setHasContext(true);
    }
  }, [route, activeProjectId, activeAgent, activeChannel]);

  const handleSelectProject = useCallback((projectId: string | null, projectName: string | null) => {
    if (projectId === null) {
      localStorage.removeItem("active-project-id");
      localStorage.removeItem("active-project-name");
      localStorage.removeItem("active-agent");
      localStorage.removeItem("active-channel");
      setActiveProjectId(null);
      setActiveProjectFriendlyName(null);
      setActiveAgent(null);
      setActiveChannel(null);
      setHasContext(false);
      navigate("/");
    } else {
      localStorage.setItem("active-project-id", projectId);
      localStorage.setItem("active-project-name", projectName || projectId);
      localStorage.removeItem("active-agent");
      localStorage.removeItem("active-channel");
      localStorage.setItem("has-context", "true");
      setActiveProjectId(projectId);
      setActiveProjectFriendlyName(projectName || projectId);
      setActiveAgent(null);
      setActiveChannel(null);
      setHasContext(true);
      navigate(`/projects/${projectId}/chat`);
    }
  }, [navigate]);

  const handleSelectAgent = useCallback((agent: { id: string; name: string; avatarUrl?: string } | null) => {
    if (agent === null) {
      localStorage.removeItem("active-agent");
      setActiveAgent(null);
      setHasContext(false);
      navigate("/");
    } else {
      localStorage.setItem("active-agent", JSON.stringify(agent));
      localStorage.removeItem("active-project-id");
      localStorage.removeItem("active-project-name");
      localStorage.removeItem("active-channel");
      localStorage.setItem("has-context", "true");
      setActiveAgent(agent);
      setActiveProjectId(null);
      setActiveProjectFriendlyName(null);
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
      localStorage.removeItem("active-project-id");
      localStorage.removeItem("active-project-name");
      localStorage.removeItem("active-agent");
      localStorage.setItem("has-context", "true");
      setActiveChannel(channel);
      setActiveProjectId(null);
      setActiveProjectFriendlyName(null);
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
    // handleSelectProject(null, null);
  }

  return (
    <>
      <MainLayout
        route={route}
        onNavigate={navigate}
        activeProjectName={activeProjectFriendlyName}
        activeProjectId={activeProjectId}
        activeAgent={activeAgent}
        activeChannel={activeChannel}
        onSelectProject={handleSelectProject}
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
        onJudgeExperiment={handleJudgeExp}
      >
      {route.page === "projects" && (
        <DashboardPage onNavigate={navigate} onSelectProject={handleSelectProject} />
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
          onSelectProject={handleSelectProject}
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
          key={activeProjectId || activeAgent?.id || activeChannel?.id || "global"}
          activeProjectName={activeProjectId}
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
            key={`${route.sessionId}-${activeProjectId}-${activeAgent?.id}`}
            sessionId={route.sessionId}
            activeProjectName={activeProjectId}
            activeAgent={activeAgent}
          />
        )
      )}
      {route.page === "preview" && (
        <PreviewPanel activeProjectName={activeProjectId} />
      )}
      </MainLayout>
      <ConfirmModal
        open={showDeleteExpConfirm}
        onClose={() => {
          setShowDeleteExpConfirm(false);
          setPendingDeleteExpId(null);
        }}
        onConfirm={executeDeleteExp}
        title="Delete Experiment"
        message="Are you sure you want to permanently delete this experiment?"
        confirmLabel="Delete"
        destructive
        loading={deletingExp}
      />
    </>
  );
}
