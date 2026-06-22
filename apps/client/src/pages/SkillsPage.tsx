import { useState, useEffect, useCallback } from "react";
import { RichMarkdown } from "@/components/chat/RichMarkdown";

interface SkillInfo {
  name: string;
  description: string;
  filePath: string;
  disableModelInvocation: boolean;
  scope: "project" | "user" | "temporary";
  content: string;
}

interface Props {
  onClose: () => void;
}

export function SkillsPage({ onClose }: Props) {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);

  const token = localStorage.getItem("token");

  const fetchSkills = useCallback(async () => {
    try {
      const res = await fetch("/api/skills", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load skills");
      const data = await res.json();
      const sorted = (data.skills ?? []).sort((a: SkillInfo, b: SkillInfo) =>
        a.name.localeCompare(b.name)
      );
      setSkills(sorted);
      if (sorted.length > 0) {
        setSelectedSkill(sorted[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading skills");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  const filteredSkills = skills.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-dvh flex flex-col bg-bg text-text-primary">
      <header className="h-10 sm:h-12 flex items-center justify-between px-3 sm:px-4 border-b border-surface flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary transition-colors p-1 cursor-pointer"
            title="Back to Chat"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" className="sm:w-5 sm:h-5">
              <path d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" />
            </svg>
          </button>
          <h1 className="font-display font-bold text-text-primary text-sm">Skills Library</h1>
        </div>
        <div className="text-xs text-text-secondary">
          {skills.length} skill{skills.length !== 1 ? "s" : ""} loaded
        </div>
      </header>

      {error ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full p-4 bg-surface border border-surface-hover rounded-lg text-center">
            <p className="text-error text-sm font-semibold mb-2">Error Loading Skills</p>
            <p className="text-text-secondary text-xs mb-4">{error}</p>
            <button
              onClick={fetchSkills}
              className="px-4 py-2 bg-accent text-bg font-semibold rounded-lg hover:opacity-90 transition-opacity text-xs cursor-pointer"
            >
              Retry
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          {/* Left panel: list of skills */}
          <div className="w-80 sm:w-96 border-r border-surface flex flex-col flex-shrink-0 bg-bg">
            <div className="p-3 border-b border-surface">
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none"
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
                  placeholder="Search skills..."
                  className="w-full pl-9 pr-3 py-2 bg-surface border border-surface-hover rounded-lg
                             text-text-primary placeholder-text-secondary outline-none
                             focus:border-accent transition-colors text-xs font-sans"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredSkills.map((s) => (
                <button
                  key={s.name}
                  onClick={() => setSelectedSkill(s)}
                  className={`w-full text-left p-3 rounded-lg transition-all duration-150 cursor-pointer ${
                    selectedSkill?.name === s.name
                      ? "bg-surface text-text-primary border border-surface-hover/80 shadow"
                      : "text-text-secondary hover:bg-surface/50 hover:text-text-primary border border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono font-bold text-xs truncate max-w-[70%]">
                      {s.name}
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider ${
                        s.scope === "project"
                          ? "bg-accent/10 text-accent"
                          : "bg-highlight/10 text-highlight"
                      }`}
                    >
                      {s.scope === "project" ? "Project" : "User"}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-secondary/80 line-clamp-2 leading-relaxed">
                    {s.description}
                  </p>
                </button>
              ))}
              {filteredSkills.length === 0 && (
                <p className="text-text-secondary text-xs text-center py-8">
                  No skills found
                </p>
              )}
            </div>
          </div>

          {/* Right panel: skill details */}
          <div className="flex-1 overflow-y-auto bg-surface/10 flex flex-col min-w-0">
            {selectedSkill ? (
              <div className="p-4 sm:p-6 max-w-4xl w-full mx-auto space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-surface pb-4">
                  <div>
                    <h2 className="text-lg font-bold font-display text-text-primary">
                      {selectedSkill.name}
                    </h2>
                    <p className="text-xs text-text-secondary font-mono mt-1 break-all">
                      Location: {selectedSkill.filePath}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-semibold uppercase ${
                        selectedSkill.scope === "project"
                          ? "bg-accent/20 text-accent"
                          : "bg-highlight/20 text-highlight"
                      }`}
                    >
                      {selectedSkill.scope === "project" ? "Project-local" : "User-global"}
                    </span>
                    {selectedSkill.disableModelInvocation && (
                      <span className="text-xs px-2 py-0.5 rounded font-semibold uppercase bg-warning/20 text-warning">
                        Explicit Only
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="text-xs font-semibold uppercase text-text-secondary tracking-widest mb-1.5">
                      Description
                    </h3>
                    <p className="text-sm text-text-secondary bg-surface/40 p-3 rounded-lg border border-surface-hover/30 leading-relaxed">
                      {selectedSkill.description}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold uppercase text-text-secondary tracking-widest mb-2">
                      Instructions
                    </h3>
                    <div className="bg-surface/50 p-4 sm:p-5 rounded-lg border border-surface-hover/50 shadow-sm">
                      <RichMarkdown content={selectedSkill.content || "*No instruction text*"} />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                <svg
                  className="w-12 h-12 text-text-secondary/30 mb-3"
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
                <p className="text-text-secondary text-sm">Select a skill from the list to view its instructions</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
