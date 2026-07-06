import { useState } from "react";
import { motion } from "framer-motion";
import { useLiterals } from "@/lib";
import { literals as u } from "@/pages/LaboratoryPage.literals";

interface ExperimentEditorModalProps {
  editingExpId: string | null;
  editorName: string;
  setEditorName: (val: string) => void;
  editorPrompt: string;
  setEditorPrompt: (val: string) => void;
  editorCriteria: string[];
  setEditorCriteria: (crit: string[]) => void;
  onCancel: () => void;
  onSave: () => void;
}

export function ExperimentEditorModal({
  editingExpId,
  editorName,
  setEditorName,
  editorPrompt,
  setEditorPrompt,
  editorCriteria,
  setEditorCriteria,
  onCancel,
  onSave,
}: ExperimentEditorModalProps) {
  const l = useLiterals(u);
  const [newCriterion, setNewCriterion] = useState("");

  const handleAddCriterion = () => {
    if (newCriterion.trim() && !editorCriteria.includes(newCriterion.trim())) {
      setEditorCriteria([...editorCriteria, newCriterion.trim()]);
      setNewCriterion("");
    }
  };

  const handleRemoveCriterion = (idx: number) => {
    setEditorCriteria(editorCriteria.filter((_, i) => i !== idx));
  };

  return (
    <div className="fixed inset-0 z-55 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-input rounded-2xl w-full max-w-xl p-6 space-y-4 shadow-2xl text-left"
      >
        <div>
          <h3 className="text-sm font-bold text-foreground tracking-wide uppercase">
            {editingExpId ? "Editar Experimento" : "Nuevo Experimento"}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Diseñá tu caso de prueba y configurá los criterios del LLM-Judge para evaluar las variantes.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase font-bold text-muted-foreground tracking-wider block mb-1">
              Nombre del Experimento
            </label>
            <input
              type="text"
              value={editorName}
              onChange={(e) => setEditorName(e.target.value)}
              placeholder="Ej: Benchmark Traducción de Código"
              className="w-full bg-background border border-input rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary text-foreground"
            />
          </div>

          <div>
            <label className="text-xs uppercase font-bold text-muted-foreground tracking-wider block mb-1">
              Prompt de Tarea (Task Prompt)
            </label>
            <textarea
              value={editorPrompt}
              onChange={(e) => setEditorPrompt(e.target.value)}
              placeholder="Ej: Escribe un script en Python que calcule el factorial de un número usando recursividad."
              rows={4}
              className="w-full bg-background border border-input rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary text-foreground font-mono"
            />
          </div>

          <div>
            <label className="text-xs uppercase font-bold text-muted-foreground tracking-wider block mb-1">
              Criterios de Evaluación
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newCriterion}
                onChange={(e) => setNewCriterion(e.target.value)}
                placeholder="Ej: Completitud"
                className="flex-1 bg-background border border-input rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary text-foreground"
              />
              <button
                onClick={handleAddCriterion}
                className="px-3 py-2 bg-background border border-input hover:bg-card-hover rounded-xl text-xs font-bold text-foreground cursor-pointer"
              >
                Agregar
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {editorCriteria.map((c, i) => (
                <span
                  key={i}
                  className="text-xs px-2.5 py-1 bg-background border border-input rounded-lg text-muted-foreground flex items-center gap-1.5"
                >
                  <span>{c}</span>
                  <button
                    onClick={() => handleRemoveCriterion(i)}
                    className="text-destructive hover:text-destructive/80 font-bold cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-input/50 pt-4">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-background border border-input hover:bg-card-hover rounded-xl text-xs font-bold text-foreground cursor-pointer"
          >
            {l.cancel || "Cancelar"}
          </button>
          <button
            onClick={onSave}
            disabled={!editorName.trim() || !editorPrompt.trim()}
            className="px-4 py-2 bg-primary text-background hover:bg-primary/90 disabled:opacity-50 rounded-xl text-xs font-bold transition-all shadow cursor-pointer"
          >
            Guardar Experimento
          </button>
        </div>
      </motion.div>
    </div>
  );
}
