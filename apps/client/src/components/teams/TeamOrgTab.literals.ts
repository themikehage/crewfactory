import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    addAgent: "Add Agent",
    fitView: "Fit View",
    resetLayout: "Reset Layout",
    noAgents: "No agents in this team. Click Add Agent to invite them.",
  },
  es: {
    addAgent: "Agregar Agente",
    fitView: "Ajustar Vista",
    resetLayout: "Reiniciar Diseño",
    noAgents: "No hay agentes en este equipo. Haz clic en Agregar Agente para invitarlos.",
  },
};
