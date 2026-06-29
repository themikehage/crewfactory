import { useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";

export function LoginPage() {
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
      setError(err instanceof Error ? err.message : "Login failed");
    }
  };

  return (
    <div className="h-dvh flex items-center justify-center bg-bg">
      <div className="w-full max-w-md px-6 sm:px-8">
        <h1 className="text-3xl font-display font-bold text-text-primary text-center mb-2">
          Crew Factory
        </h1>
        <p className="text-text-secondary text-center mb-8">
          Coding agent interface
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              className="w-full px-4 py-3 bg-surface border border-surface-hover rounded-lg
                         text-text-primary placeholder-text-secondary outline-none
                         focus:border-accent transition-colors"
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 bg-surface border border-surface-hover rounded-lg
                         text-text-primary placeholder-text-secondary outline-none
                         focus:border-accent transition-colors"
            />
          </div>
          {error && (
            <p className="text-error text-sm text-center">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-accent text-bg font-semibold rounded-lg
                       hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
