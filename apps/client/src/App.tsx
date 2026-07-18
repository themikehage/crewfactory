import { AuthProvider } from "@/contexts/AuthContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { AppRouter } from "@/components/layout/AppRouter";
import { LiteralsProvider } from "@/lib";

export function App() {
  return (
    <AuthProvider>
      <LiteralsProvider>
        <ToastProvider>
          <AppRouter />
        </ToastProvider>
      </LiteralsProvider>
    </AuthProvider>
  );
}
