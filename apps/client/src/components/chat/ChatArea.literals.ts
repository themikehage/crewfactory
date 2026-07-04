import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    unknownError: "Unknown error",
    branchError: "Failed to switch conversation branch",
    connected: "Connected",
    reconnecting: "Reconnecting...",
  },
  es: {
    unknownError: "Error desconocido",
    branchError: "Error al cambiar de rama de conversacion",
    connected: "Conectado",
    reconnecting: "Reconectando...",
  },
};
