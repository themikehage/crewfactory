import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    deleteTeam: "Delete Team",
    openChat: "Open Chat",
    manageMembers: "Members",
    agents: "agents",
    agent: "agent",
  },
  es: {
    deleteTeam: "Eliminar Equipo",
    openChat: "Abrir Chat",
    manageMembers: "Miembros",
    agents: "agentes",
    agent: "agente",
  },
};
