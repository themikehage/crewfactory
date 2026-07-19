import { useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { LoginPage } from "@/pages/LoginPage";
import { OnboardingPage } from "@/pages/OnboardingPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SkillsPage } from "@/pages/SkillsPage";
import { AgentsPage } from "@/pages/AgentsPage";
import { ChannelsPage } from "@/pages/ChannelsPage";
import { ChannelDetailPage } from "@/pages/ChannelDetailPage";
import { ChannelOrgPage } from "@/pages/ChannelOrgPage";
import { ChannelBenchmarkPage } from "@/pages/ChannelBenchmarkPage";
import { LogsConsolePage } from "@/pages/LogsConsolePage";
import { LaboratoryPage } from "@/pages/LaboratoryPage";
import { ExperimentDetailPage } from "@/pages/ExperimentDetailPage";
import { MCPMarketplacePage } from "@/pages/MCPMarketplacePage";
import { PluginsPage } from "@/pages/PluginsPage";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import { ChatArea } from "@/components/chat/ChatArea";
import { DelegationsPanel } from "@/components/chat/DelegationsPanel";
import { ChannelChatArea } from "@/components/channels/ChannelChatArea";
import { TeamChatArea } from "@/components/teams/TeamChatArea";
import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { DashboardPage } from "@/pages/DashboardPage";
import { TeamsPage } from "@/pages/TeamsPage";
import { TeamDetailPage } from "@/pages/TeamDetailPage";
import { SessionsKanbanPage } from "@/pages/SessionsKanbanPage";
import { SessionsProvider } from "@/contexts/SessionsContext";
import { useRouter } from "@/hooks/useRouter";
import { PipelinesPage } from "@/pages/PipelinesPage";
import { PipelineDetailPage } from "@/pages/PipelineDetailPage";
import { MainLayout } from "./MainLayout";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useNavigationStack, type NavigationStackItem } from "@/hooks/useNavigationStack";
import { ExportExperimentModal } from "@/components/laboratory/ExportExperimentModal";
import { RunExperimentModal } from "@/components/laboratory/RunExperimentModal";
import { GlobalApprovalOverlay } from "@/components/approvals/GlobalApprovalOverlay";
import { useLaboratoryController } from "@/hooks/useLaboratoryController";
import { useWorkspaceContext } from "@/hooks/useWorkspaceContext";

export function AppRouter() {
  const { user, loading, needsSetup } = useAuth();
  const { route, navigate } = useRouter();
  const isMobileState = useIsMobile();
  const navigationStack = useNavigationStack();

  const workspace = useWorkspaceContext({ route, navigate });
  const { activeProjectId, activeProjectFriendlyName, activeAgent, activeChannel, activeTeam } = workspace;

  const currentExpId = route.page === "laboratory" && route.experimentId ? route.experimentId : null;
  const laboratory = useLaboratoryController({ experimentId: currentExpId, enabled: Boolean(user), navigate });

  const routeToStackItem = useCallback((r: typeof route): NavigationStackItem => {
    const isLab = r.page === "laboratory";
    const isWorkspace = r.page === "workspace";
    const isPreview = r.page === "preview";
    const isChat = r.page === "chat";
    const isOrg = r.page === "org";
    const isBenchmark = r.page === "benchmark";

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

    if (isBenchmark && activeChannel) {
      return {
        type: "context",
        contextType: "channel",
        contextId: activeChannel.id,
        contextName: activeChannel.name,
        page: "benchmark",
        path: `/channels/${activeChannel.id}/benchmarks`,
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
      if (activeTeam) {
        return {
          type: "context",
          contextType: "team",
          contextId: activeTeam.id,
          contextName: activeTeam.name,
          page: "chat",
          path: r.sessionId ? `/teams/${activeTeam.id}/session/${r.sessionId}` : `/teams/${activeTeam.id}/chat`,
        };
      }
      return {
        type: "home",
        page: "chat",
        path: r.sessionId ? `/session/${r.sessionId}` : "/",
      };
    }

    if (isWorkspace) {
      const cType = activeProjectId ? "project" : activeAgent ? "agent" : activeChannel ? "channel" : activeTeam ? "team" : undefined;
      const cId = activeProjectId || activeAgent?.id || activeChannel?.id || activeTeam?.id || undefined;
      const cName = activeProjectFriendlyName || activeAgent?.name || activeChannel?.name || activeTeam?.name || undefined;
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
              : activeTeam
                ? `/teams/${activeTeam.id}/workspace`
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
  }, [activeProjectId, activeProjectFriendlyName, activeAgent, activeChannel, activeTeam]);

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

  useEffect(() => {
    if (route.page === "mcps") {
      localStorage.setItem("settings-active-tab", "mcp");
      navigate("/settings");
    }
  }, [navigate, route.page]);

  const { selectProject, selectAgent, selectChannel, selectTeam } = workspace;

  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (needsSetup) {
    return <OnboardingPage />;
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <SessionsProvider>
      <GlobalApprovalOverlay />
      <MainLayout
        route={route}
        onNavigate={navigate}
        activeProjectName={activeProjectFriendlyName}
        activeProjectId={activeProjectId}
        activeAgent={route.page === "laboratory" && !route.experimentId ? { id: "lab-architect", name: "Lab Architect" } : activeAgent}
        activeChannel={activeChannel}
        activeTeam={activeTeam}
        onSelectProject={selectProject}
        onSelectAgent={selectAgent}
        onSelectChannel={selectChannel}
        onSelectTeam={selectTeam}
        isMobile={isMobileState.isMobile}
        canGoBack={navigationStack.canGoBack}
        onBack={handleBack}
        lab={{
          selectedExpId: route.page === "laboratory" && route.experimentId ? route.experimentId : null,
          experiments: laboratory.experiments,
          onDeleteExperiment: laboratory.requestDelete,
          activeVariantTab: laboratory.activeVariantTab,
          setActiveVariantTab: laboratory.setActiveVariantTab,
          onRunExperiment: laboratory.requestRun,
          onStopExperiment: laboratory.stopRun,
          onEditExperiment: laboratory.requestEdit,
          onJudgeExperiment: laboratory.judgeExperiment,
          onExportExperiment: laboratory.requestExport,
          selectedRunId: laboratory.selectedRunId,
          pastRuns: laboratory.pastRuns,
          runPopoverOpen: laboratory.runPopoverOpen,
          setRunPopoverOpen: laboratory.setRunPopoverOpen,
          onSelectRun: laboratory.selectRun,
        }}
      >
        {route.page === "projects" && (
          <DashboardPage onNavigate={navigate} onSelectProject={selectProject} />
        )}
        {route.page === "settings" && (
          <SettingsPage />
        )}
        {route.page === "skills" && (
          <SkillsPage />
        )}
        {route.page === "agents" && (
          <AgentsPage onSelectAgent={selectAgent} />
        )}
        {route.page === "channels" && (
          <ChannelsPage onNavigate={navigate} onSelectChannel={selectChannel} />
        )}
        {route.page === "logs" && (
          <LogsConsolePage
            onSelectProject={selectProject}
            onSelectAgent={selectAgent}
            onSelectChannel={selectChannel}
            onNavigate={navigate}
          />
        )}
        {route.page === "laboratory" && !route.experimentId && (
          <LaboratoryPage
            onNavigate={navigate}
            experiments={laboratory.experiments}
            setExperiments={laboratory.setExperiments}
            isEditorOpen={laboratory.isEditorOpen}
            setIsEditorOpen={laboratory.setIsEditorOpen}
            editingExpId={laboratory.editingExpId}
            sessionId={route.sessionId}
          />
        )}
        {route.page === "laboratory" && route.experimentId && (
          <ExperimentDetailPage
            experimentId={route.experimentId}
            experiments={laboratory.experiments}
            setExperiments={laboratory.setExperiments}
            activeVariantTab={laboratory.activeVariantTab}
            setActiveVariantTab={laboratory.setActiveVariantTab}
            onJudgeExperiment={laboratory.judgeExperiment}
            selectedRunId={laboratory.selectedRunId}
            selectedRunData={laboratory.selectedRunData}
            onRefreshRuns={() => currentExpId && laboratory.fetchPastRuns(currentExpId)}
          />
        )}
        {route.page === "mcps" && (
          <MCPMarketplacePage />
        )}
        {route.page === "plugins" && (
          <PluginsPage />
        )}
        {route.page === "sessions" && (
          <SessionsKanbanPage onNavigate={navigate} />
        )}
        {route.page === "pipelines" && !route.pipelineId && (
          <PipelinesPage />
        )}
        {route.page === "pipelines" && route.pipelineId && (
          <PipelineDetailPage
            pipelineId={route.pipelineId}
            runId={route.runId}
            onNavigate={navigate}
          />
        )}
        {route.page === "channel" && (
          <ChannelDetailPage channelId={route.channelId} onNavigate={navigate} />
        )}
        {route.page === "team" && (
          <TeamDetailPage teamId={route.teamId} onNavigate={navigate} />
        )}
        {route.page === "org" && (
          <ChannelOrgPage channelId={route.channelId} onNavigate={navigate} />
        )}
        {route.page === "benchmark" && (
          <ChannelBenchmarkPage channelId={route.channelId} onNavigate={navigate} />
        )}
        {route.page === "teams" && (
          <TeamsPage />
        )}
        {route.page === "delegations" && (
          <DelegationsPanel
            key={`${route.sessionId}-${activeProjectId}-${activeAgent?.id}-${activeChannel?.id}-${activeTeam?.id}`}
            sessionId={route.sessionId}
            activeProjectName={activeProjectId}
            activeAgent={activeAgent}
            activeChannel={activeChannel}
            activeTeam={activeTeam}
          />
        )}
        {route.page === "workspace" && (
          <WorkspacePanel
            key={activeProjectId || activeAgent?.id || activeChannel?.id || activeTeam?.id || "global"}
            activeProjectName={activeProjectId}
            activeAgentId={activeAgent?.id}
            activeChannelId={activeChannel?.id}
            activeTeamId={activeTeam?.id}
          />
        )}
        {route.page === "chat" && (
          activeChannel ? (
            <ChannelChatArea
              key={`${route.sessionId}-${activeChannel.id}`}
              activeChannel={activeChannel}
              sessionId={route.sessionId}
            />
          ) : activeTeam ? (
            <TeamChatArea
              key={`${route.sessionId}-${activeTeam.id}`}
              activeTeam={activeTeam}
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
        open={laboratory.deleteModal.open}
        onClose={laboratory.deleteModal.onClose}
        onConfirm={laboratory.deleteModal.onConfirm}
        title="Delete Experiment"
        message="Are you sure you want to permanently delete this experiment?"
        confirmLabel="Delete"
        destructive
        loading={laboratory.deleteModal.loading}
      />
      {laboratory.exportExperiment && (
        <ExportExperimentModal
          experiment={laboratory.exportExperiment}
          onClose={laboratory.closeExport}
          onNavigate={navigate}
        />
      )}
      {laboratory.runPromptModal.open && (
        <RunExperimentModal
          runPromptValue={laboratory.runPromptModal.value}
          setRunPromptValue={laboratory.runPromptModal.setValue}
          onCancel={laboratory.runPromptModal.onCancel}
          onConfirm={laboratory.runPromptModal.onConfirm}
        />
      )}
    </SessionsProvider>
  );
}
