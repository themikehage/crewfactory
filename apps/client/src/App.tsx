import { AuthProvider } from "@/contexts/AuthContext";
import { AppRouter } from "@/components/layout/AppRouter";
import { LiteralsProvider } from "@/lib";

export function App() {
  return (
    <AuthProvider>
      <LiteralsProvider>
        <AppRouter />
      </LiteralsProvider>
    </AuthProvider>
  );
}
