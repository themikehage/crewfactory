import { motion } from "framer-motion";
import { useLiterals } from "@/lib";
import { literals as u } from "@/pages/LaboratoryPage.literals";

interface RunExperimentModalProps {
  runPromptValue: string;
  setRunPromptValue: (val: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RunExperimentModal({
  runPromptValue,
  setRunPromptValue,
  onCancel,
  onConfirm,
}: RunExperimentModalProps) {
  const l = useLiterals(u);

  return (
    <div className="fixed inset-0 z-55 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card border border-input rounded-2xl w-full max-w-xl p-6 space-y-4 shadow-2xl text-left"
      >
        <div>
          <h3 className="text-sm font-bold text-foreground tracking-wide uppercase">
            Iniciar Corrida de Experimento
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Ingresá la tarea específica (prompt) sobre la cual querés que debata y resuelva la tripulación en esta ejecución.
          </p>
        </div>

        <div>
          <label className="text-xs uppercase font-bold text-muted-foreground tracking-wider block mb-1">
            Tarea / Prompt de Ejecución
          </label>
          <textarea
            value={runPromptValue}
            onChange={(e) => setRunPromptValue(e.target.value)}
            placeholder="Ej: Escribe un script en Python que busque imágenes en un directorio usando glob y PIL."
            rows={5}
            className="w-full bg-background border border-input rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary text-foreground font-mono leading-relaxed"
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-input/50 pt-4">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-background border border-input hover:bg-card-hover rounded-xl text-xs font-bold text-foreground cursor-pointer"
          >
            {l.cancel || "Cancelar"}
          </button>
          <button
            onClick={onConfirm}
            disabled={!runPromptValue.trim()}
            className="px-4 py-2 bg-primary text-background hover:bg-primary/90 disabled:opacity-50 rounded-xl text-xs font-bold transition-all shadow cursor-pointer"
          >
            {l.confirmRun || "Iniciar Corrida"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
