import { useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/Button";

export function OnboardingPage() {
  const { register, loading } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    try {
      await register(username, password, email || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    }
  };

  return (
    <div className="h-dvh flex items-center justify-center bg-background">
      <div className="w-full max-w-md px-6 sm:px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-display font-bold text-foreground mb-2">
            Welcome to CrewFactory
          </h1>
          <p className="text-muted-foreground">
            Create your admin account to get started
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
            minLength={3}
            maxLength={32}
            pattern="^[a-zA-Z0-9_-]+$"
            title="Letters, numbers, hyphens and underscores only"
            className="w-full px-4 py-3 bg-card border border-input rounded-lg
                       text-foreground placeholder-text-secondary outline-none
                       focus:border-primary transition-colors"
          />
          <input
            type="password"
            placeholder="Password (min. 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full px-4 py-3 bg-card border border-input rounded-lg
                       text-foreground placeholder-text-secondary outline-none
                       focus:border-primary transition-colors"
          />
          <input
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            className="w-full px-4 py-3 bg-card border border-input rounded-lg
                       text-foreground placeholder-text-secondary outline-none
                       focus:border-primary transition-colors"
          />
          <input
            type="email"
            placeholder="Email (optional, for recovery)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 bg-card border border-input rounded-lg
                       text-foreground placeholder-text-secondary outline-none
                       focus:border-primary transition-colors"
          />
          {error && (
            <p className="text-destructive text-sm text-center">{error}</p>
          )}
          <Button
            type="submit"
            disabled={loading}
            size="lg"
            className="w-full"
          >
            {loading ? "Creating account..." : "Create Account"}
          </Button>
        </form>
      </div>
    </div>
  );
}
