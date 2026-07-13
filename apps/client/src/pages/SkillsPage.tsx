import { apiFetch } from "@/lib/api";
import { useState, useEffect, useCallback } from "react";
import { RichMarkdown } from "@/components/chat/RichMarkdown";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/contexts/ToastContext";
import { useLiterals } from "@/lib";
import { literals as u } from "./SkillsPage.literals";
import { Button } from "@/components/ui/Button";

interface SkillInfo {
  name: string;
  description: string;
  filePath: string;
  disableModelInvocation: boolean;
  scope: "project" | "user" | "temporary";
  content: string;
}

export function SkillsPage() {
  const l = useLiterals(u);
  const { addToast } = useToast();
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);
  const [mobileShowDetails, setMobileShowDetails] = useState(false);

  const [resetting, setResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const executeReset = useCallback(async () => {
    setShowResetConfirm(false);
    setResetting(true);
    try {
      const res = await apiFetch("/api/skills/reset", {
        method: "POST"});
      if (!res.ok) throw new Error(l.loadError);
      
      window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: "skill" } }));
      addToast("success", l.resetSuccess);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast("error", l.resetErrorPrefix + msg);
    } finally {
      setResetting(false);
    }
  }, [addToast, l.loadError, l.resetSuccess, l.resetErrorPrefix]);

  const handleResetSkills = useCallback(() => {
    setShowResetConfirm(true);
  }, []);

  const fetchSkills = useCallback(async () => {
    try {
      const res = await apiFetch("/api/skills");
      if (!res.ok) throw new Error(l.loadError);
      const data = await res.json();
      const sorted = (data.skills ?? []).sort((a: SkillInfo, b: SkillInfo) =>
        a.name.localeCompare(b.name)
      );
      setSkills(sorted);
      if (sorted.length > 0) {
        setSelectedSkill(sorted[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : l.loadError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.type === "skill" || !customEvent.detail?.type) {
        fetchSkills();
      }
    };
    window.addEventListener("entity-updated", handleUpdate);
    return () => window.removeEventListener("entity-updated", handleUpdate);
  }, [fetchSkills]);

  const filteredSkills = skills.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col bg-background text-foreground">
      {error ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full p-4 bg-card border border-input rounded-lg text-center">
            <p className="text-destructive text-sm font-semibold mb-2">{l.errorTitle}</p>
            <p className="text-muted-foreground text-xs mb-4">{error}</p>
            <Button onClick={fetchSkills} size="sm">
              Retry
            </Button>
          </div>
        </div>
      ) : loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          <div className={`w-full md:w-80 lg:w-96 border-r border-border flex flex-col flex-shrink-0 bg-background ${mobileShowDetails ? "hidden md:flex" : "flex"}`}>
            <div className="p-3 border-b border-border flex flex-col gap-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
                  </svg>
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={l.searchPlaceholder}
                    className="w-full pl-9 pr-3 py-2 bg-card border border-input rounded-lg
                               text-foreground placeholder-text-secondary outline-none
                               focus:border-primary transition-colors text-xs font-sans"
                  />
                </div>
                <button
                  onClick={handleResetSkills}
                  disabled={resetting || loading}
                  title={l.resetTooltip}
                  className="p-2 bg-card hover:bg-card-hover border border-input text-muted-foreground hover:text-primary rounded-lg transition-colors flex items-center justify-center flex-shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {resetting ? (
                    <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89H18v3" />
                    </svg>
                  )}
                </button>
              </div>
              <div className="text-xs text-muted-foreground select-none font-medium px-0.5">
                {skills.length} {l.skillCount}{skills.length !== 1 ? "s" : ""} loaded
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredSkills.map((s) => (
                <button
                  key={s.name}
                  onClick={() => {
                    setSelectedSkill(s);
                    setMobileShowDetails(true);
                  }}
                  className={`w-full text-left p-3 rounded-lg transition-all duration-150 cursor-pointer ${
                    selectedSkill?.name === s.name
                      ? "bg-card text-foreground border border-input/80 shadow"
                      : "text-muted-foreground hover:bg-card/50 hover:text-foreground border border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono font-bold text-xs truncate max-w-[70%]">
                      {s.name}
                    </span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider ${
                        s.scope === "project"
                          ? "bg-primary/10 text-primary"
                          : "bg-highlight/10 text-highlight"
                      }`}
                    >
                      {s.scope === "project" ? l.scopeProject : l.scopeUser}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground/80 line-clamp-2 leading-relaxed">
                    {s.description}
                  </p>
                </button>
              ))}
              {filteredSkills.length === 0 && (
                <p className="text-muted-foreground text-xs text-center py-8">
                  {l.noSkillsFound}
                </p>
              )}
            </div>
          </div>

          <div className={`flex-1 overflow-y-auto bg-card/10 flex flex-col min-w-0 ${!mobileShowDetails ? "hidden md:flex" : "flex"}`}>
            {selectedSkill ? (
              <div className="p-4 sm:p-6 max-w-4xl w-full mx-auto space-y-4">
                <button
                  onClick={() => setMobileShowDetails(false)}
                  className="md:hidden flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3 cursor-pointer"
                >
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" />
                  </svg>
                  {l.backToList}
                </button>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-4">
                  <div>
                    <h2 className="text-lg font-bold font-display text-foreground">
                      {selectedSkill.name}
                    </h2>
                    <p className="text-xs text-muted-foreground font-mono mt-1 break-all">
                      {l.location} {selectedSkill.filePath}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-semibold uppercase ${
                        selectedSkill.scope === "project"
                          ? "bg-primary/20 text-primary"
                          : "bg-highlight/20 text-highlight"
                      }`}
                    >
                      {selectedSkill.scope === "project" ? l.scopeProjectDetail : l.scopeUserDetail}
                    </span>
                    {selectedSkill.disableModelInvocation && (
                      <span className="text-xs px-2 py-0.5 rounded font-semibold uppercase bg-warning/20 text-warning">
                        {l.explicitOnly}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-widest mb-1.5">
                      Description
                    </h3>
                    <p className="text-sm text-muted-foreground bg-card/40 p-3 rounded-lg border border-input/30 leading-relaxed">
                      {selectedSkill.description}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-widest mb-2">
                      Instructions
                    </h3>
                    <div className="bg-card/50 p-4 sm:p-5 rounded-lg border border-input/50 shadow-sm">
                      <RichMarkdown content={selectedSkill.content || l.noInstructionText} />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                <svg
                  className="w-12 h-12 text-muted-foreground mb-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                  />
                </svg>
                <p className="text-muted-foreground text-sm">{l.selectSkillHint}</p>
              </div>
            )}
          </div>
        </div>
      )}
      <ConfirmModal
        open={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={executeReset}
        title={l.resetConfirmTitle ?? "Reset Skills"}
        message={l.resetConfirm}
        confirmLabel={l.resetConfirmButton ?? "Reset"}
        cancelLabel={l.cancel ?? "Cancel"}
        destructive
        loading={resetting}
      />
    </div>
  );
}
