import { useCallback, useEffect } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LoginPage } from "@/pages/LoginPage";
import { OnboardingPage } from "@/pages/OnboardingPage";
import { SessionsProvider } from "@/contexts/SessionsContext";
import { MainLayout } from "./MainLayout";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useNavigationStack, type NavigationStackItem } from "@/hooks/useNavigationStack";
import { GlobalApprovalOverlay } from "@/components/approvals/GlobalApprovalOverlay";
import { useLaboratoryController } from "@/hooks/useLaboratoryController";
import { useWorkspaceContext, WorkspaceContextProvider } from "@/hooks/useWorkspaceContext";
import { LaboratoryModals } from "@/components/laboratory/LaboratoryModals";
import { LaboratoryProvider } from "@/router/LaboratoryContext";
import { useRoutePage } from "@/router/useRoutePage";

export function AppRouter() {
  const location = useLocation();
  const routerNavigate = useNavigate();
  const navigate = useCallback((path: string) => routerNavigate(path), [routerNavigate]);
  return <WorkspaceContextProvider>
    <AppRouterContent locationPath={location.pathname} navigate={navigate} />
  </WorkspaceContextProvider>;
}

interface AppRouterContentProps {
  locationPath: string;
  navigate: (path: string) => void;
}

function AppRouterContent({ locationPath, navigate }: AppRouterContentProps) {
  const page = useRoutePage();
  const { experimentId } = useParams();
  const { user, loading, needsSetup } = useAuth();
  const isMobileState = useIsMobile();
  const navigationStack = useNavigationStack();
  const workspace = useWorkspaceContext();
  const { activeProjectId, activeProjectFriendlyName, activeAgent, activeChannel, activeTeam, selectProject, selectAgent, selectChannel, selectTeam } = workspace;
  const currentExpId = page === "laboratory" ? experimentId ?? null : null;
  const laboratory = useLaboratoryController({ experimentId: currentExpId, enabled: Boolean(user), navigate });

  useEffect(() => {
    const item: NavigationStackItem = { type: page === "chat" ? "home" : "admin", page, path: locationPath };
    const previous = navigationStack.stack[navigationStack.stack.length - 2];
    if (previous?.path === item.path) navigationStack.pop();
    else navigationStack.push(item);
  }, [locationPath, navigationStack, page]);

  const handleBack = useCallback(() => {
    const previous = navigationStack.stack[navigationStack.stack.length - 2];
    navigate(navigationStack.canGoBack && previous?.path ? previous.path : "/");
  }, [navigate, navigationStack.canGoBack, navigationStack.stack]);

  if (loading) return <div className="h-dvh flex items-center justify-center bg-background"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (needsSetup) return <OnboardingPage />;
  if (!user) return <LoginPage />;

  return <SessionsProvider>
    <GlobalApprovalOverlay />
    <LaboratoryProvider controller={laboratory}>
      <MainLayout page={page} onNavigate={navigate} activeProjectName={activeProjectFriendlyName} activeProjectId={activeProjectId} activeAgent={page === "laboratory" && !currentExpId ? { id: "lab-architect", name: "Lab Architect" } : activeAgent} activeChannel={activeChannel} activeTeam={activeTeam} onSelectProject={selectProject} onSelectAgent={selectAgent} onSelectChannel={selectChannel} onSelectTeam={selectTeam} isMobile={isMobileState.isMobile} canGoBack={navigationStack.canGoBack} onBack={handleBack} lab={{ selectedExpId: currentExpId, experiments: laboratory.experiments, onDeleteExperiment: laboratory.requestDelete, activeVariantTab: laboratory.activeVariantTab, setActiveVariantTab: laboratory.setActiveVariantTab, onRunExperiment: laboratory.requestRun, onStopExperiment: laboratory.stopRun, onEditExperiment: laboratory.requestEdit, onJudgeExperiment: laboratory.judgeExperiment, onExportExperiment: laboratory.requestExport, selectedRunId: laboratory.selectedRunId, pastRuns: laboratory.pastRuns, runPopoverOpen: laboratory.runPopoverOpen, setRunPopoverOpen: laboratory.setRunPopoverOpen, onSelectRun: laboratory.selectRun }}>
        <Outlet />
      </MainLayout>
    </LaboratoryProvider>
    <LaboratoryModals controller={laboratory} navigate={navigate} />
  </SessionsProvider>;
}
