import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { LoginPage } from "@/pages/LoginPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SkillsPage } from "@/pages/SkillsPage";
import { WorkspacePanel } from "@/components/workspace/WorkspacePanel";
import { ChatArea } from "@/components/chat/ChatArea";
import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { DashboardPage } from "@/pages/DashboardPage";
import { useRouter } from "@/hooks/useRouter";
import { MainLayout } from "./MainLayout";

export function AppRouter() {
  const { token, user, loading } = useAuth();
  const { route, navigate } = useRouter();

  // Cargar el repo activo y el estado de contexto desde localStorage
  const [activeRepoName, setActiveRepoName] = useState<string | null>(() => {
    return localStorage.getItem("active-repo") || null;
  });

  const [hasContext, setHasContext] = useState<boolean>(() => {
    return localStorage.getItem("has-context") === "true";
  });

  const handleSelectRepo = useCallback((repoName: string | null) => {
    if (repoName === null) {
      localStorage.removeItem("active-repo");
    } else {
      localStorage.setItem("active-repo", repoName);
    }
    localStorage.setItem("has-context", "true");
    setActiveRepoName(repoName);
    setHasContext(true);
    // Redirigir a home/chat al cambiar de repositorio
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
    handleSelectRepo(null);
  }

  return (
    <MainLayout
      route={route}
      onNavigate={navigate}
      activeRepoName={activeRepoName}
    >
      {route.page === "projects" && (
        <DashboardPage onSelectRepo={handleSelectRepo} />
      )}
      {route.page === "settings" && (
        <SettingsPage />
      )}
      {route.page === "skills" && (
        <SkillsPage />
      )}
      {route.page === "workspace" && (
        <WorkspacePanel key={activeRepoName || "global"} activeRepoName={activeRepoName} />
      )}
      {route.page === "chat" && (
        <ChatArea
          key={`${route.sessionId}-${activeRepoName}`}
          sessionId={route.sessionId}
          activeRepoName={activeRepoName}
        />
      )}
      {route.page === "preview" && (
        <PreviewPanel activeRepoName={activeRepoName} />
      )}
    </MainLayout>
  );
}
