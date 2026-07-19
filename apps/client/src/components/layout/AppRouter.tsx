import { useCallback, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { LoginPage } from "@/pages/LoginPage";
import { OnboardingPage } from "@/pages/OnboardingPage";
import { SessionsProvider } from "@/contexts/SessionsContext";
import { useRouter, type Route } from "@/hooks/useRouter";
import { MainLayout } from "./MainLayout";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useNavigationStack, type NavigationStackItem } from "@/hooks/useNavigationStack";
import { GlobalApprovalOverlay } from "@/components/approvals/GlobalApprovalOverlay";
import { useLaboratoryController } from "@/hooks/useLaboratoryController";
import { useWorkspaceContext, WorkspaceContextProvider } from "@/hooks/useWorkspaceContext";
import { AppRouteContent } from "@/router/AppRouteContent";
import { LaboratoryModals } from "@/components/laboratory/LaboratoryModals";
import { buildContextPath, buildSessionPath, buildWorkspacePath, type ContextPathInput } from "@/router/paths";

export function AppRouter() {
  const { route, navigate } = useRouter();
  return <WorkspaceContextProvider route={route} navigate={navigate}>
    <AppRouterContent route={route} navigate={navigate} />
  </WorkspaceContextProvider>;
}

interface AppRouterContentProps {
  route: Route;
  navigate: (path: string) => void;
}

function AppRouterContent({ route, navigate }: AppRouterContentProps) {
  const { user, loading, needsSetup } = useAuth();
  const isMobileState = useIsMobile();
  const navigationStack = useNavigationStack();
  const workspace = useWorkspaceContext();
  const { activeProjectId, activeProjectFriendlyName, activeAgent, activeChannel, activeTeam, selectProject, selectAgent, selectChannel, selectTeam } = workspace;
  const currentExpId = route.page === "laboratory" && route.experimentId ? route.experimentId : null;
  const laboratory = useLaboratoryController({ experimentId: currentExpId, enabled: Boolean(user), navigate });

  const getContext = useCallback((): ContextPathInput | null => {
    if (activeProjectId) return { type: "project", id: activeProjectId };
    if (activeAgent) return { type: "agent", id: activeAgent.id };
    if (activeChannel) return { type: "channel", id: activeChannel.id };
    if (activeTeam) return { type: "team", id: activeTeam.id };
    return null;
  }, [activeAgent, activeChannel, activeProjectId, activeTeam]);

  const routeToStackItem = useCallback((currentRoute: Route): NavigationStackItem => {
    const context = getContext();
    if (currentRoute.page === "chat") {
      return { type: context ? "context" : "home", contextType: context?.type, contextId: context?.id, contextName: activeProjectFriendlyName || activeAgent?.name || activeChannel?.name || activeTeam?.name, page: "chat", path: currentRoute.sessionId ? buildSessionPath(context, currentRoute.sessionId) : context ? buildContextPath(context) : "/" };
    }
    if (currentRoute.page === "workspace") {
      return { type: "context", contextType: context?.type, contextId: context?.id, contextName: activeProjectFriendlyName || activeAgent?.name || activeChannel?.name || activeTeam?.name, page: "workspace", path: buildWorkspacePath(context) };
    }
    if (currentRoute.page === "preview" && activeProjectId) {
      return { type: "context", contextType: "project", contextId: activeProjectId, contextName: activeProjectFriendlyName || activeProjectId, page: "preview", path: buildContextPath({ type: "project", id: activeProjectId }, "preview") };
    }
    if (currentRoute.page === "laboratory") {
      return { type: "context", contextType: "project", contextId: currentRoute.experimentId || undefined, contextName: "Laboratorio", page: "laboratory", path: currentRoute.experimentId ? `/laboratory/${currentRoute.experimentId}` : "/laboratory" };
    }
    if ((currentRoute.page === "org" || currentRoute.page === "benchmark") && activeChannel) {
      const page = currentRoute.page === "org" ? "org" : "benchmarks";
      return { type: "context", contextType: "channel", contextId: activeChannel.id, contextName: activeChannel.name, page: currentRoute.page, path: buildContextPath({ type: "channel", id: activeChannel.id }, page) };
    }
    return { type: "admin", page: currentRoute.page, path: `/${currentRoute.page}` };
  }, [activeAgent?.name, activeChannel, activeProjectFriendlyName, activeProjectId, activeTeam?.name, getContext]);

  useEffect(() => {
    const item = routeToStackItem(route);
    const previous = navigationStack.stack[navigationStack.stack.length - 2];
    if (previous?.path === item.path) navigationStack.pop();
    else navigationStack.push(item);
  }, [navigationStack, route, routeToStackItem]);

  useEffect(() => {
    if (route.page === "mcps") {
      localStorage.setItem("settings-active-tab", "mcp");
      navigate("/settings");
    }
  }, [navigate, route.page]);

  const handleBack = useCallback(() => {
    const previous = navigationStack.stack[navigationStack.stack.length - 2];
    navigate(navigationStack.canGoBack && previous?.path ? previous.path : "/");
  }, [navigate, navigationStack.canGoBack, navigationStack.stack]);

  if (loading) return <div className="h-dvh flex items-center justify-center bg-background"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (needsSetup) return <OnboardingPage />;
  if (!user) return <LoginPage />;

  return <SessionsProvider>
    <GlobalApprovalOverlay />
    <MainLayout route={route} onNavigate={navigate} activeProjectName={activeProjectFriendlyName} activeProjectId={activeProjectId} activeAgent={route.page === "laboratory" && !route.experimentId ? { id: "lab-architect", name: "Lab Architect" } : activeAgent} activeChannel={activeChannel} activeTeam={activeTeam} onSelectProject={selectProject} onSelectAgent={selectAgent} onSelectChannel={selectChannel} onSelectTeam={selectTeam} isMobile={isMobileState.isMobile} canGoBack={navigationStack.canGoBack} onBack={handleBack} lab={{ selectedExpId: currentExpId, experiments: laboratory.experiments, onDeleteExperiment: laboratory.requestDelete, activeVariantTab: laboratory.activeVariantTab, setActiveVariantTab: laboratory.setActiveVariantTab, onRunExperiment: laboratory.requestRun, onStopExperiment: laboratory.stopRun, onEditExperiment: laboratory.requestEdit, onJudgeExperiment: laboratory.judgeExperiment, onExportExperiment: laboratory.requestExport, selectedRunId: laboratory.selectedRunId, pastRuns: laboratory.pastRuns, runPopoverOpen: laboratory.runPopoverOpen, setRunPopoverOpen: laboratory.setRunPopoverOpen, onSelectRun: laboratory.selectRun }}>
      <AppRouteContent route={route} navigate={navigate} activeProjectId={activeProjectId} activeAgent={activeAgent} activeChannel={activeChannel} activeTeam={activeTeam} selectProject={selectProject} selectAgent={selectAgent} selectChannel={selectChannel} laboratory={laboratory} />
    </MainLayout>
    <LaboratoryModals controller={laboratory} navigate={navigate} />
  </SessionsProvider>;
}
