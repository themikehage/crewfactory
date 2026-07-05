import { useState, useEffect, useCallback } from "react";
import { useLiterals } from "@/lib";
import { literals as u } from "./ThemeToggle.literals";

type Theme = "dark" | "light" | "system";

export function ThemeToggle() {
  const l = useLiterals(u);
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      return (localStorage.getItem("theme") as Theme) || "system";
    } catch {
      return "system";
    }
  });

  const applyTheme = useCallback((t: Theme) => {
    const isDark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (isDark) {
      document.documentElement.classList.add("dark");
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#121212");
    } else {
      document.documentElement.classList.remove("dark");
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#ffffff");
    }
  }, []);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem("theme", theme);
    } catch {}
  }, [theme, applyTheme]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme, applyTheme]);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
        {l.themeLabel}
      </span>
      <div className="flex bg-background border border-input rounded-lg overflow-hidden">
        {(["dark", "light", "system"] as Theme[]).map((t) => (
          <button
            key={t}
            onClick={() => setThemeState(t)}
            className={`px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
              theme === t
                ? "bg-primary text-background"
                : "text-muted-foreground hover:text-foreground hover:bg-card-hover/50"
            }`}
          >
            {l[t]}
          </button>
        ))}
      </div>
    </div>
  );
}
