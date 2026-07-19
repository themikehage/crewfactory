import { AuthProvider } from "@/contexts/AuthContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { AppRouter } from "@/components/layout/AppRouter";
import { LiteralsProvider } from "@/lib";
import { BrowserRouter } from "react-router-dom";

export function App() {
  return (
    <AuthProvider>
      <LiteralsProvider>
        <ToastProvider>
          <BrowserRouter>
            <AppRouter />
          </BrowserRouter>
        </ToastProvider>
      </LiteralsProvider>
    </AuthProvider>
  );
}
