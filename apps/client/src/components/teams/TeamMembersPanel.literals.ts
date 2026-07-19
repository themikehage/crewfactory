import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    addAgent: "Add",
    removeAgent: "Remove Agent",
    agentNotFound: "Agent not found",
    role: "Role",
    outputMode: "Output Mode",
  },
  es: {
    addAgent: "Añadir",
    removeAgent: "Quitar Agente",
    agentNotFound: "Agente no encontrado",
    role: "Rol",
    outputMode: "Modo de Salida",
  },
};
