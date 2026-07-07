import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    statusActive: "Active",
    statusStreaming: "Streaming...",
    statusTaskRunning: "Task Running...",
    statusSleeping: "Sleeping",
    contextGlobal: "Global",
    close: "Close",
    creating: "Creating...",
    histExec: "Historical execution",
    messages: "messages",
    message: "message",
    deleteSession: "Delete Session",
    sessionHistory: "Session History",
  },
  es: {
    statusActive: "Activa",
    statusStreaming: "Transmitiendo...",
    statusTaskRunning: "Tarea en ejecucion...",
    statusSleeping: "Inactiva",
    contextGlobal: "Global",
    close: "Cerrar",
    creating: "Creando...",
    histExec: "Ejecucion historica",
    messages: "mensajes",
    message: "mensaje",
    deleteSession: "Eliminar Sesion",
    sessionHistory: "Historial de Sesiones",
  },
};
