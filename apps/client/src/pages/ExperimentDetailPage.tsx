import { useState, useEffect, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { AnimatePresence, motion } from "framer-motion";
import type { Experiment } from "@/types/laboratory";
import { VariantViewer } from "@/components/laboratory/VariantViewer";
import { JudgeReport } from "@/components/laboratory/JudgeReport";
import { ExperimentConfigTab } from "@/components/laboratory/ExperimentConfigTab";
import { ChatArea } from "@/components/chat/ChatArea";

interface Props {
  experimentId: string;
  experiments: Experiment[];
  setExperiments: React.Dispatch<React.SetStateAction<Experiment[]>>;
  activeVariantTab: "chat" | "config" | "single" | "multiNoLeader" | "multiWithLeader" | "compare";
  setActiveVariantTab: (tab: "chat" | "config" | "single" | "multiNoLeader" | "multiWithLeader" | "compare") => void;
  onJudgeExperiment?: (id: string, judgeModel?: string) => Promise<void>;
  /**
   * Run selector state lifted to AppRouter for sharing with MainLayout clock icon.
   */
  selectedRunId: string;
  selectedRunData: Experiment | null;
  onRefreshRuns: () => void;
}

export function ExperimentDetailPage({
  experimentId,
  experiments,
  setExperiments,
  activeVariantTab,
  setActiveVariantTab,
  onJudgeExperiment,
  selectedRunId,
  selectedRunData,
  onRefreshRuns,
}: Props) {
  const [labSessionId, setLabSessionId] = useState<string | null>(null);
  const labArchitectAgent = useMemo(() => ({ id: "lab-architect" as const, name: "Lab Architect" }), []);
  const [isJudging, setIsJudging] = useState(false);

  const activeExp = experiments.find((e) => e.id === experimentId) || null;

  // Resolve chat session for lab-architect
  useEffect(() => {
    let active = true;
    const resolveLabSession = async () => {
      try {
        const res = await apiFetch("/api/sessions");
        if (!res.ok || !active) return;
        const data = await res.json();
        const sessions = data.sessions || [];

        const found = sessions.find((s: any) =>
          s.agentId === "lab-architect" && s.experimentId === experimentId
        );

        if (found) {
          setLabSessionId(found.id);
        } else {
          const sessionName = `Diseño: ${activeExp?.name || "Experimento"}`;

          const createRes = await apiFetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: sessionName,
              agentId: "lab-architect",
              experimentId,
            }),
          });

          if (createRes.ok && active) {
            const newSession = await createRes.json();
            setLabSessionId(newSession.id);
          }
        }
      } catch (err) {
        console.error("Failed to resolve laboratory session:", err);
      }
    };

    resolveLabSession();
    return () => {
      active = false;
    };
  }, [experimentId, activeExp?.name]);

  // Live Experiment state used for tabs
  const displayExp = selectedRunId === "latest" ? activeExp : selectedRunData;

  // Auto switch tab to active variant / compare tab when running
  useEffect(() => {
    if (activeExp && activeExp.status === "running" && activeExp.activeVariant) {
      if (activeExp.activeVariant === "judging") {
        if (activeVariantTab !== "compare") {
          setActiveVariantTab("compare");
        }
      } else {
        const variantTabs = ["single", "multiNoLeader", "multiWithLeader"];
        if (variantTabs.includes(activeExp.activeVariant) && activeVariantTab !== activeExp.activeVariant) {
          setActiveVariantTab(activeExp.activeVariant as any);
        }
      }
    }
  }, [activeExp?.status, activeExp?.activeVariant, activeVariantTab, setActiveVariantTab]);

  if (!displayExp) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs text-muted-foreground">Cargando detalles del experimento...</p>
      </div>
    );
  }

  const isCurrentJudging = activeExp?.activeVariant === "judging";

  return (
    <div className="flex h-full min-h-0 bg-background text-foreground font-body flex-col">
      {/* Main Content Area */}
      <div className="flex-1 min-h-0 bg-background flex flex-col overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeVariantTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex-1 min-h-0"
          >
            {activeVariantTab === "chat" ? (
              labSessionId ? (
                <ChatArea
                  key={labSessionId}
                  sessionId={labSessionId}
                  activeProjectName={null}
                  activeAgent={labArchitectAgent}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-xs text-muted-foreground">Cargando conversación del laboratorio...</p>
                </div>
              )
            ) : activeVariantTab === "config" ? (
              <ExperimentConfigTab
                experiment={displayExp}
                onUpdate={(updated) => {
                  setExperiments((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
                }}
              />
            ) : activeVariantTab === "compare" ? (
              <JudgeReport
                exp={displayExp}
                isJudging={isJudging || isCurrentJudging}
                onJudge={async (judgeModel) => {
                  if (!onJudgeExperiment) return;
                  setIsJudging(true);
                  try {
                    await onJudgeExperiment(displayExp.id, judgeModel);
                    onRefreshRuns();
                  } finally {
                    setIsJudging(false);
                  }
                }}
                onNavigate={(tab) => setActiveVariantTab(tab as any)}
              />
            ) : (
              <VariantViewer
                experimentId={displayExp.id}
                variantKey={activeVariantTab as any}
                activeSessionId={displayExp.variants[activeVariantTab]?.activeSessionId || null}
                status={
                  displayExp.status === "running"
                    ? (displayExp.variants[activeVariantTab]?.result
                      ? displayExp.variants[activeVariantTab].result.status
                      : (displayExp.variants[activeVariantTab]?.activeSessionId ? "running" : "pending"))
                    : (displayExp.variants[activeVariantTab]?.result?.status || "pending")
                }
                result={displayExp.variants[activeVariantTab]?.result || null}
                criteria={displayExp.judge?.criteria}
                expName={displayExp.name}
                expDescription={displayExp.taskPrompt}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
