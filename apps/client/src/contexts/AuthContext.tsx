import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/api";

interface User {
  username: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  needsSetup: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, email?: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  const clearAppState = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("active-project");
    localStorage.removeItem("active-project-id");
    localStorage.removeItem("active-project-name");
    localStorage.removeItem("active-agent");
    localStorage.removeItem("active-channel");
    localStorage.removeItem("has-context");
    localStorage.removeItem("crewfy-selected-model");
  };

  useEffect(() => {
    apiFetch("/api/auth/status")
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json() as { needsSetup: boolean; authenticated: boolean; user?: User };
        setNeedsSetup(data.needsSetup);
        if (data.authenticated && data.user) {
          setUser(data.user);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      clearAppState();
    };
    window.addEventListener("auth-unauthorized", handleUnauthorized);
    return () => window.removeEventListener("auth-unauthorized", handleUnauthorized);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Login failed");
      }

      const data = await res.json() as { user: User };
      setUser(data.user);
      setNeedsSetup(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (username: string, password: string, email?: string) => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, email }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Registration failed");
      }

      const data = await res.json() as { user: User };
      setUser(data.user);
      setNeedsSetup(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    clearAppState();
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const res = await apiFetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    if (!res.ok) {
      const data = await res.json() as { error?: string };
      throw new Error(data.error ?? "Failed to change password");
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, needsSetup, login, register, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
