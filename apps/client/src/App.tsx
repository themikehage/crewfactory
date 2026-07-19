import { AuthProvider } from "@/contexts/AuthContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { LiteralsProvider } from "@/lib";
import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "@/router/routes";

export function App() {
  return (
    <AuthProvider>
      <LiteralsProvider>
        <ToastProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </ToastProvider>
      </LiteralsProvider>
    </AuthProvider>
  );
}
