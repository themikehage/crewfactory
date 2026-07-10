import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    removeAgent: "Remove agent from channel",
    addAgent: "Add Agent",
    agentNotFound: "Agent not found",
  },
  es: {
    removeAgent: "Remover agente del canal",
    addAgent: "Agregar Agente",
    agentNotFound: "Agente no encontrado",
  },
};
