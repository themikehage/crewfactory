import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { LoginPage } from "@/pages/LoginPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SkillsPage } from "@/pages/SkillsPage";
import { AgentsPage } from "@/pages/AgentsPage";
import { ChannelsPage } from "@/pages/ChannelsPage";
import { ChannelDetailPage } from "@/pages/ChannelDetailPage";
import { ChannelOrgPage } from "@/pages/ChannelOrgPage";
import { LogsConsolePage } from "@/pages/LogsConsolePage";
import { LaboratoryPage } from "@/pages/LaboratoryPage";
import { ExperimentDetailPage } from "@/pages/ExperimentDetailPage";
import { MCPMarketplacePage } from "@/pages/MCPMarketplacePage";
import { PluginsPage } from "@/pages/PluginsPage";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import { ChatArea } from "@/components/chat/ChatArea";
import { DelegationsPanel } from "@/components/chat/DelegationsPanel";
import { ChannelChatArea } from "@/components/channels/ChannelChatArea";
import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { DashboardPage } from "@/pages/DashboardPage";
import { useRouter } from "@/hooks/useRouter";
import { MainLayout } from "./MainLayout";
import { apiFetch } from "@/lib/api";
import type { Experiment } from "@/types/laboratory";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useNavigationStack, type NavigationStackItem } from "@/hooks/useNavigationStack";
import { ExportExperimentModal } from "@/components/laboratory/ExportExperimentModal";
import { RunExperimentModal } from "@/components/laboratory/RunExperimentModal";

export function AppRouter() {
  const { token, user, loading } = useAuth();
  const { route, navigate } = useRouter();
  const isMobileState = useIsMobile();
  const navigationStack = useNavigationStack();

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
  const [exportingExpId, setExportingExpId] = useState<string | null>(null);
  const [activeVariantTab, setActiveVariantTab] = useState<"chat" | "config" | "single" | "multiNoLeader" | "multiWithLeader" | "compare">("chat");

  const [showDeleteExpConfirm, setShowDeleteExpConfirm] = useState(false);
  const [pendingDeleteExpId, setPendingDeleteExpId] = useState<string | null>(null);
  const [deletingExp, setDeletingExp] = useState(false);

  // --- Run selector state (shared between MainLayout clock icon and ExperimentDetailPage) ---
  const [selectedRunId, setSelectedRunId] = useState<string>("latest");
  const [selectedRunData, setSelectedRunData] = useState<Experiment | null>(null);
  const [pastRuns, setPastRuns] = useState<any[]>([]);
  const [runPopoverOpen, setRunPopoverOpen] = useState(false);

  const currentExpId = route.page === "laboratory" && route.experimentId ? route.experimentId : null;

  const fetchPastRuns = useCallback(async (expId: string) => {
    try {
      const res = await apiFetch(`/api/experiments/${expId}/runs`);
      if (res.ok) {
        const data = await res.json();
        setPastRuns(data.runs || []);
      }
    } catch (e) {
      console.error("Failed to fetch runs:", e);
    }
  }, []);

  const handleSelectRun = useCallback(async (runId: string) => {
    setSelectedRunId(runId);
    if (runId === "latest" || !currentExpId) {
      setSelectedRunData(null);
    } else {
      try {
        const res = await apiFetch(`/api/experiments/${currentExpId}/runs/${runId}`);
        if (res.ok) {
          const data = await res.json();
          setSelectedRunData(data.experiment as Experiment);
        }
      } catch (e) {
        console.error("Failed to load run details:", e);
      }
    }
  }, [currentExpId]);

  useEffect(() => {
    if (currentExpId) {
      setSelectedRunId("latest");
      setSelectedRunData(null);
      fetchPastRuns(currentExpId);
    }
  }, [currentExpId, fetchPastRuns]);

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

  const handleJudgeExp = useCallback(async (id: string, judgeModel?: string) => {
    try {
      const res = await apiFetch(`/api/experiments/${id}/judge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ judgeModel })
      });
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

  const routeToStackItem = useCallback((r: typeof route): NavigationStackItem => {
    const isLab = r.page === "laboratory";
    const isWorkspace = r.page === "workspace";
    const isPreview = r.page === "preview";
    const isChat = r.page === "chat";
    const isOrg = r.page === "org";

    if (isOrg && activeChannel) {
      return {
        type: "context",
        contextType: "channel",
        contextId: activeChannel.id,
        contextName: activeChannel.name,
        page: "org",
        path: `/channels/${activeChannel.id}/org`,
      };
    }

    if (isChat) {
      if (activeProjectId) {
        return {
          type: "context",
          contextType: "project",
          contextId: activeProjectId,
          contextName: activeProjectFriendlyName || activeProjectId,
          page: "chat",
          path: r.sessionId ? `/projects/${activeProjectId}/session/${r.sessionId}` : `/projects/${activeProjectId}/chat`,
        };
      }
      if (activeAgent) {
        return {
          type: "context",
          contextType: "agent",
          contextId: activeAgent.id,
          contextName: activeAgent.name,
          page: "chat",
          path: r.sessionId ? `/agents/${activeAgent.id}/session/${r.sessionId}` : `/agents/${activeAgent.id}/chat`,
        };
      }
      if (activeChannel) {
        return {
          type: "context",
          contextType: "channel",
          contextId: activeChannel.id,
          contextName: activeChannel.name,
          page: "chat",
          path: r.sessionId ? `/channels/${activeChannel.id}/session/${r.sessionId}` : `/channels/${activeChannel.id}/chat`,
        };
      }
      return {
        type: "home",
        page: "chat",
        path: r.sessionId ? `/session/${r.sessionId}` : "/",
      };
    }

    if (isWorkspace) {
      const cType = activeProjectId ? "project" : activeAgent ? "agent" : activeChannel ? "channel" : undefined;
      const cId = activeProjectId || activeAgent?.id || activeChannel?.id || undefined;
      const cName = activeProjectFriendlyName || activeAgent?.name || activeChannel?.name || undefined;
      return {
        type: "context",
        contextType: cType,
        contextId: cId,
        contextName: cName,
        page: "workspace",
        path: activeProjectId
          ? `/projects/${activeProjectId}/workspace`
          : activeAgent
            ? `/agents/${activeAgent.id}/workspace`
            : activeChannel
              ? `/channels/${activeChannel.id}/workspace`
              : "/workspace",
      };
    }

    if (isPreview && activeProjectId) {
      return {
        type: "context",
        contextType: "project",
        contextId: activeProjectId,
        contextName: activeProjectFriendlyName || activeProjectId,
        page: "preview",
        path: `/projects/${activeProjectId}/preview`,
      };
    }

    if (isLab) {
      return {
        type: "context",
        contextType: "project",
        contextId: r.experimentId || undefined,
        contextName: "Laboratorio",
        page: "laboratory",
        path: r.experimentId ? `/laboratory/${r.experimentId}` : "/laboratory",
      };
    }

    return {
      type: "admin",
      page: r.page,
      path: `/${r.page}`,
    };
  }, [activeProjectId, activeProjectFriendlyName, activeAgent, activeChannel]);

  useEffect(() => {
    const item = routeToStackItem(route);
    const secondToLast = navigationStack.stack[navigationStack.stack.length - 2];

    if (secondToLast && secondToLast.path === item.path) {
      navigationStack.pop();
    } else {
      navigationStack.push(item);
    }
  }, [route, routeToStackItem, navigationStack.push, navigationStack.pop, navigationStack.stack]);

  const handleBack = useCallback(() => {
    if (navigationStack.canGoBack) {
      const prev = navigationStack.stack[navigationStack.stack.length - 2];
      if (prev && prev.path) {
        navigate(prev.path);
      } else {
        navigate("/");
      }
    } else {
      navigate("/");
    }
  }, [navigationStack.canGoBack, navigationStack.stack, navigate]);

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
    if (route.page === "mcps") {
      localStorage.setItem("settings-active-tab", "mcp");
      navigate("/settings");
      return;
    }

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
        isMobile={isMobileState.isMobile}
        canGoBack={navigationStack.canGoBack}
        onBack={handleBack}
        lab={{
          selectedExpId: route.page === "laboratory" && route.experimentId ? route.experimentId : null,
          experiments: experiments,
          onDeleteExperiment: handleDeleteExp,
          activeVariantTab: activeVariantTab,
          setActiveVariantTab: setActiveVariantTab,
          onRunExperiment: (id) => {
            const exp = experiments.find((e) => e.id === id);
            if (exp) {
              setRunningExpId(id);
              setRunPromptValue(exp.taskPrompt);
              setIsRunPromptModalOpen(true);
            }
          },
          onStopExperiment: handleStopRun,
          onEditExperiment: (id) => {
            const exp = experiments.find((e) => e.id === id);
            if (exp) {
              setEditingLabExpId(id);
              setIsLabEditorOpen(true);
            }
          },
          onJudgeExperiment: handleJudgeExp,
          onExportExperiment: (id) => setExportingExpId(id),
          selectedRunId: selectedRunId,
          pastRuns: pastRuns,
          runPopoverOpen: runPopoverOpen,
          setRunPopoverOpen: setRunPopoverOpen,
          onSelectRun: handleSelectRun,
        }}
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
        {route.page === "laboratory" && !route.experimentId && (
          <LaboratoryPage
            onNavigate={navigate}
            experiments={experiments}
            setExperiments={setExperiments}
            isEditorOpen={isLabEditorOpen}
            setIsEditorOpen={setIsLabEditorOpen}
            editingExpId={editingLabExpId}
          />
        )}
        {route.page === "laboratory" && route.experimentId && (
          <ExperimentDetailPage
            experimentId={route.experimentId}
            experiments={experiments}
            setExperiments={setExperiments}
            activeVariantTab={activeVariantTab}
            setActiveVariantTab={setActiveVariantTab}
            onJudgeExperiment={handleJudgeExp}
            selectedRunId={selectedRunId}
            selectedRunData={selectedRunData}
            onRefreshRuns={() => currentExpId && fetchPastRuns(currentExpId)}
          />
        )}
        {route.page === "mcps" && (
          <MCPMarketplacePage />
        )}
        {route.page === "plugins" && (
          <PluginsPage />
        )}
        {route.page === "channel" && (
          <ChannelDetailPage channelId={route.channelId} onNavigate={navigate} />
        )}
        {route.page === "org" && (
          <ChannelOrgPage channelId={route.channelId} onNavigate={navigate} />
        )}
        {route.page === "delegations" && (
          <DelegationsPanel
            key={`${route.sessionId}-${activeProjectId}-${activeAgent?.id}-${activeChannel?.id}`}
            sessionId={route.sessionId}
            activeProjectName={activeProjectId}
            activeAgent={activeAgent}
            activeChannel={activeChannel}
          />
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
      {exportingExpId && (() => {
        const exp = experiments.find((e) => e.id === exportingExpId);
        if (!exp) return null;
        return (
          <ExportExperimentModal
            experiment={exp}
            onClose={() => setExportingExpId(null)}
            onNavigate={navigate}
          />
        );
      })()}
      {isRunPromptModalOpen && (
        <RunExperimentModal
          runPromptValue={runPromptValue}
          setRunPromptValue={setRunPromptValue}
          onCancel={() => {
            setIsRunPromptModalOpen(false);
            setRunningExpId(null);
          }}
          onConfirm={handleConfirmRun}
        />
      )}
    </>
  );
}
