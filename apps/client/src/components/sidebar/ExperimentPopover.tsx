import { useState, useCallback } from "react";
import type { Experiment } from "@/types/laboratory";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  experiments: Experiment[];
  selectedExpId: string | null;
  onSelectExp: (id: string | null) => void;
  onCreateExperiment: () => void;
  onDeleteExperiment: (id: string) => void;
  loading?: boolean;
}

const statusConfig: Record<string, { color: string; label: string }> = {
  running: { color: "bg-blue-400", label: "Ejecutando..." },
  completed: { color: "bg-primary", label: "Completado" },
  failed: { color: "bg-destructive", label: "Fallo" },
  designing: { color: "bg-text-secondary/30", label: "Diseño" },
};

export function ExperimentPopover({
  isOpen,
  onClose,
  experiments,
  selectedExpId,
  onSelectExp,
  onCreateExperiment,
  onDeleteExperiment,
  loading = false,
}: Props) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDeleteClick = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConfirmDeleteId(id);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (confirmDeleteId) {
      onDeleteExperiment(confirmDeleteId);
      setConfirmDeleteId(null);
    }
  }, [confirmDeleteId, onDeleteExperiment]);

  const handleCancelDelete = useCallback(() => {
    setConfirmDeleteId(null);
  }, []);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop transparente para cerrar con click fuera */}
      <div
        className="fixed inset-0 z-40 bg-transparent"
        onClick={onClose}
      />

      {/* Popover flotante */}
      <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-input rounded-xl shadow-2xl flex flex-col z-55 animate-scale-in max-h-[420px] overflow-hidden">
        {/* Header */}
        <div className="p-3 border-b border-input flex items-center justify-between flex-shrink-0 bg-card/80 backdrop-blur-md">
          <div className="flex flex-col min-w-0">
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Historial</span>
            <span className="text-xs font-bold text-primary truncate">
              Experimentos
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-card-hover rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Cerrar"
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Nuevo Experimento */}
        <div className="p-2 border-b border-input flex-shrink-0">
          <button
            onClick={() => {
              onCreateExperiment();
              onClose();
            }}
            className="w-full py-1.5 text-xs bg-primary text-background rounded-lg hover:opacity-90 transition-opacity font-semibold cursor-pointer flex items-center justify-center gap-1"
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Nuevo Experimento
          </button>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-card/20 max-h-[300px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-2 text-muted-foreground">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">Cargando experimentos...</span>
            </div>
          ) : experiments.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-[11px]">
              Sin experimentos registrados
            </div>
          ) : (
            experiments.map((exp) => {
              const cfg = statusConfig[exp.status] || { color: "bg-card border-input text-muted-foreground", label: exp.status };
              const isActive = selectedExpId === exp.id;
              return (
                <div key={exp.id} className="group relative">
                  <button
                    onClick={() => {
                      onSelectExp(exp.id);
                      onClose();
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-all cursor-pointer ${
                      isActive
                        ? "bg-card-hover/80 text-foreground border border-input"
                        : "text-muted-foreground hover:bg-card-hover/40 hover:text-foreground border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.color}`} title={cfg.label} />
                      <span className="truncate flex-1 font-medium font-sans">{exp.name}</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5 text-xs text-muted-foreground">
                      <span className="truncate max-w-[170px]">{exp.taskPrompt}</span>
                      <span className={`font-semibold ${cfg.color.replace("bg-", "text-") || "text-muted-foreground"}`}>
                        {cfg.label}
                      </span>
                    </div>
                  </button>
                  <button
                    onClick={(e) => handleDeleteClick(e, exp.id)}
                    className="absolute right-2 top-1/2 -translate-y-1/2
                               text-muted-foreground hover:text-destructive transition-colors p-1 rounded hover:bg-card-hover opacity-0 group-hover:opacity-100 cursor-pointer"
                    title="Eliminar Experimento"
                  >
                    <svg width="10" height="10" viewBox="0 0 14 14" fill="currentColor">
                      <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.5" fill="none" />
                    </svg>
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Modal de confirmación de borrado */}
        {confirmDeleteId && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs animate-fade-in">
            <div className="bg-card border border-input rounded-xl p-4 mx-4 max-w-xs w-full shadow-2xl animate-scale-in">
              <p className="text-xs font-medium text-foreground mb-3">
                ¿Estás seguro de que querés borrar este experimento? Se eliminarán todos sus datos y corridas.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={handleCancelDelete}
                  className="px-2.5 py-1.5 text-xs rounded-lg bg-card-hover text-muted-foreground hover:text-foreground transition-colors cursor-pointer font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="px-2.5 py-1.5 text-xs rounded-lg bg-destructive text-white hover:opacity-90 transition-opacity cursor-pointer font-medium"
                >
                  Borrar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
