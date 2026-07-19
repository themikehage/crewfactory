import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    teamNotFound: "Team not found",
    backToTeams: "Back to Teams",
    chat: "Chat",
    members: "Members",
    addAgent: "Add Agent",
    save: "Save",
  },
  es: {
    teamNotFound: "Equipo no encontrado",
    backToTeams: "Volver a Equipos",
    chat: "Chat",
    members: "Miembros",
    addAgent: "Añadir Agente",
    save: "Guardar",
  },
};
