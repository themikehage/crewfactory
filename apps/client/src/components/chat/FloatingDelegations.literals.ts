import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    title: "Active Delegations",
    running: "Running",
    success: "Success",
    error: "Error",
    blocked: "Blocked",
  },
  es: {
    title: "Delegaciones Activas",
    running: "Ejecutando",
    success: "Completada",
    error: "Error",
    blocked: "Bloqueada",
  },
};
