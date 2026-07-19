import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    title: "Team Members",
    subtitle: "Manage agents and their roles in this team",
    addAgent: "Add Agent",
    addToTeam: "Add to Team",
    adding: "Adding...",
    remove: "Remove",
    role: "Role",
    outputMode: "Output Mode",
    noAgents: "All registered agents are already in this team.",
    cancel: "Cancel",
    save: "Save",
    addError: "Failed to add member",
  },
  es: {
    title: "Miembros del Equipo",
    subtitle: "Gestiona los agentes y sus roles en este equipo",
    addAgent: "Añadir Agente",
    addToTeam: "Añadir al Equipo",
    adding: "Añadiendo...",
    remove: "Quitar",
    role: "Rol",
    outputMode: "Modo de Salida",
    noAgents: "Todos los agentes registrados ya están en este equipo.",
    cancel: "Cancelar",
    save: "Guardar",
    addError: "Error al añadir miembro",
  },
};
