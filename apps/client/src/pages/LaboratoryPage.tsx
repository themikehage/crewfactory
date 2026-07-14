import { useState, useEffect, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { useLiterals } from "@/lib";
import { literals as u } from "./LaboratoryPage.literals";
import { AnimatePresence, motion } from "framer-motion";
import type { Experiment } from "@/types/laboratory";
import { ChatArea } from "@/components/chat/ChatArea";
import { ExperimentEditorModal } from "@/components/laboratory/ExperimentEditorModal";

interface Props {
  onNavigate?: (path: string) => void;
  experiments: Experiment[];
  setExperiments: React.Dispatch<React.SetStateAction<Experiment[]>>;
  isEditorOpen: boolean;
  setIsEditorOpen: (open: boolean) => void;
  editingExpId: string | null;
  sessionId?: string | null;
}

export function LaboratoryPage({
  onNavigate,
  experiments,
  setExperiments,
  isEditorOpen,
  setIsEditorOpen,
  editingExpId,
  sessionId,
}: Props) {
  const l = useLiterals(u);

  // Experiment Editor State (for Scratch Mode/Edit Modal)
  const [editorName, setEditorName] = useState("");
  const [editorPrompt, setEditorPrompt] = useState("");
  const [editorCriteria, setEditorCriteria] = useState<string[]>([]);
  const [editorVariants, setEditorVariants] = useState<any | null>(null);

  const [labSessionId, setLabSessionId] = useState<string | null>(null);
  const labArchitectAgent = useMemo(() => ({ id: "lab-architect" as const, name: "Lab Architect" }), []);

  // Update labSessionId when prop sessionId changes
  useEffect(() => {
    if (sessionId) {
      setLabSessionId(sessionId);
    }
  }, [sessionId]);

  // Initialize translated criteria when literals load
  useEffect(() => {
    if (l.workQuality && editorCriteria.length === 0) {
      setEditorCriteria([l.workQuality, l.efficiency, l.negotiation]);
    }
  }, [l, editorCriteria.length]);

  useEffect(() => {
    if (isEditorOpen && editingExpId) {
      const exp = experiments.find((e) => e.id === editingExpId);
      if (exp) {
        setEditorName(exp.name);
        setEditorPrompt(exp.taskPrompt);
        setEditorCriteria(exp.judge?.criteria || ["Calidad", "Eficiencia"]);
        setEditorVariants(null);
      }
    } else if (isEditorOpen && !editingExpId) {
      setEditorName("");
      setEditorPrompt("");
      setEditorCriteria([l.workQuality || "Calidad", l.efficiency || "Eficiencia", l.negotiation || "Negociación"]);
      setEditorVariants(null);
    }
  }, [isEditorOpen, editingExpId, experiments, l]);

  // Resolve chat session for general lab-architect (no experiment ID bound)
  useEffect(() => {
    let active = true;
    const resolveLabSession = async () => {
      try {
        const res = await apiFetch("/api/sessions");
        if (!res.ok || !active) return;
        const data = await res.json();
        const sessions = data.sessions || [];

        // Search for a session without experimentId
        const found = sessions.find((s: any) => 
          s.agentId === "lab-architect" && !s.experimentId
        );

        if (found) {
          setLabSessionId(found.id);
          if (!sessionId && onNavigate) {
            onNavigate(`/laboratory/session/${found.id}`);
          }
        } else {
          // Create new session
          const createRes = await apiFetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "Diseño de Experimentos",
              agentId: "lab-architect",
            }),
          });

          if (createRes.ok && active) {
            const newSession = await createRes.json();
            setLabSessionId(newSession.id);
            if (onNavigate) {
              onNavigate(`/laboratory/session/${newSession.id}`);
            }
          }
        }
      } catch (err) {
        console.error("Failed to resolve laboratory session:", err);
      }
    };

    if (!sessionId) {
      resolveLabSession();
    }
    return () => {
      active = false;
    };
  }, [sessionId, onNavigate]);

  // Listen to select-lab-experiment custom event
  useEffect(() => {
    const handleSelectExp = (e: any) => {
      if (e.detail?.id && onNavigate) {
        onNavigate(`/laboratory/${e.detail.id}`);
      }
    };
    window.addEventListener("select-lab-experiment", handleSelectExp);
    return () => window.removeEventListener("select-lab-experiment", handleSelectExp);
  }, [onNavigate]);

  // Listen to entity-updated custom event
  useEffect(() => {
    const handleEntityUpdate = (e: any) => {
      if (e.detail?.type === "experiment" || e.detail?.type === "all") {
        apiFetch("/api/experiments").then((res) => {
          if (res.ok) {
            res.json().then((data) => {
              setExperiments(data.experiments || []);
            });
          }
        });
      }
    };
    window.addEventListener("entity-updated", handleEntityUpdate);
    return () => window.removeEventListener("entity-updated", handleEntityUpdate);
  }, [setExperiments]);

  const handleSaveExperiment = async () => {
    if (!editorName.trim() || !editorPrompt.trim()) return;

    const isEdit = !!editingExpId;
    const body = {
      name: editorName,
      taskPrompt: editorPrompt,
      criteria: editorCriteria,
      variants: editorVariants,
    };

    try {
      const res = await apiFetch(
        isEdit ? `/api/experiments/${editingExpId}` : "/api/experiments",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const saved = data.experiment as Experiment;
        if (isEdit) {
          setExperiments((prev) => prev.map((e) => (e.id === saved.id ? saved : e)));
        } else {
          setExperiments((prev) => [saved, ...prev]);
        }
        setIsEditorOpen(false);
        if (onNavigate) {
          onNavigate(`/laboratory/${saved.id}`);
        }
      }
    } catch (e) {
      console.error(l.saveExperimentError || "Error al guardar el experimento", e);
    }
  };

  return (
    <div className="flex h-full min-h-0 bg-background text-foreground font-body">
      {/* Principal Content Area */}
      <div className="flex-1 min-w-0 bg-background flex flex-col overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key="laboratory-design-chat"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex-1 flex flex-col min-h-0"
          >
            {labSessionId ? (
              <ChatArea
                key={labSessionId}
                sessionId={labSessionId}
                activeProjectName={null}
                activeAgent={labArchitectAgent}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-xs text-muted-foreground">Iniciando asistente de diseño de laboratorio...</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Modal Editor / Creator of Experiments */}
      {isEditorOpen && (
        <ExperimentEditorModal
          editingExpId={editingExpId}
          editorName={editorName}
          setEditorName={setEditorName}
          editorPrompt={editorPrompt}
          setEditorPrompt={setEditorPrompt}
          editorCriteria={editorCriteria}
          setEditorCriteria={setEditorCriteria}
          onCancel={() => setIsEditorOpen(false)}
          onSave={handleSaveExperiment}
        />
      )}
    </div>
  );
}
