import { useAuth } from "@/contexts/AuthContext";
import { LoginPage } from "@/pages/LoginPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { useRouter } from "@/hooks/useRouter";
import { ChatLayout } from "./ChatLayout";

export function AppRouter() {
  const { token, user, loading } = useAuth();
  const { route, navigate } = useRouter();

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

  if (route.page === "settings") {
    return <SettingsPage onClose={() => navigate("/")} />;
  }

  return <ChatLayout sessionId={route.sessionId} />;
}
