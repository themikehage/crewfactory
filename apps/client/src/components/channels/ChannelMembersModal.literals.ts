import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    emptyHint: "No agents in this channel. Click \"Add Agent\" to get started.",
    removeAgent: "Remove agent from channel",
    selectTargets: "Select targets...",
    agentNotFound: "Agent not found",
  },
  es: {
    emptyHint: "No hay agentes en este canal. Haz click en \"Agregar Agente\" para comenzar.",
    removeAgent: "Remover agente del canal",
    selectTargets: "Seleccionar objetivos...",
    agentNotFound: "Agente no encontrado",
  },
};
