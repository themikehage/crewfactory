import { useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLiterals } from "@/lib";
import { literals as loginLiterals } from "./LoginPage.literals";

export function LoginPage() {
  const l = useLiterals(loginLiterals);
  const { login, loading } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : l.loginFailed);
    }
  };

  return (
    <div className="h-dvh flex items-center justify-center bg-background">
      <div className="w-full max-w-md px-6 sm:px-8">
        <h1 className="text-3xl font-display font-bold text-foreground text-center mb-2">
          {l.title}
        </h1>
        <p className="text-muted-foreground text-center mb-8">
          {l.subtitle}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              placeholder={l.usernamePlaceholder}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              className="w-full px-4 py-3 bg-card border border-input rounded-lg
                         text-foreground placeholder-text-secondary outline-none
                         focus:border-primary transition-colors"
            />
          </div>
          <div>
            <input
              type="password"
              placeholder={l.passwordPlaceholder}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 bg-card border border-input rounded-lg
                         text-foreground placeholder-text-secondary outline-none
                         focus:border-primary transition-colors"
            />
          </div>
          {error && (
            <p className="text-destructive text-sm text-center">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-primary text-background font-semibold rounded-lg
                       hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? l.signingIn : l.signIn}
          </button>
        </form>
      </div>
    </div>
  );
}
