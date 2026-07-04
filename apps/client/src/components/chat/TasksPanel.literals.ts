import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    decomposing: "Decomposing objective...",
    paused: "Task queue paused",
    completed: "All tasks completed successfully",
    failed: "Runner stopped due to failure",
    pause: "Pause execution",
    startResume: "Start or resume queue execution",
    reset: "Reset steps to pending",
    newStepTitle: "Initialize Step",
    newStepPrompt: "Explain changes here...",
    stepTitlePlaceholder: "Step Title",
    stepPromptPlaceholder: "Detailed Instructions/Prompt",
  },
  es: {
    decomposing: "Descomponiendo objetivo...",
    paused: "Cola de tareas pausada",
    completed: "Todas las tareas completadas exitosamente",
    failed: "Ejecutor detenido por error",
    pause: "Pausar ejecucion",
    startResume: "Iniciar o reanudar la cola de ejecucion",
    reset: "Reiniciar pasos a pendientes",
    newStepTitle: "Inicializar Paso",
    newStepPrompt: "Explica los cambios aqui...",
    stepTitlePlaceholder: "Titulo del Paso",
    stepPromptPlaceholder: "Instrucciones Detalladas/Prompt",
  },
};
