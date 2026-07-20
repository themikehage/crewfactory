import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    noSession: "No Active Session",
    noSessionDesc: "Select or create a session to view its execution timeline.",
    loading: "Loading timeline...",
    title: "Session Timeline",
    subtitle: "Details of milestones and tool execution turns",
  },
  es: {
    noSession: "Sin Sesión Activa",
    noSessionDesc: "Seleccioná o creá una sesión para ver su línea de tiempo de ejecución.",
    loading: "Cargando línea de tiempo...",
    title: "Timeline de la Sesión",
    subtitle: "Detalle de hitos y turnos de ejecución de herramientas",
  }
};
