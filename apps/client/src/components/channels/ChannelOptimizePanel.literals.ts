import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    startError: "Failed to start optimization loop",
    timeoutError: "Optimization loop timed out. Please check the logs.",
    triggerError: "Failed to trigger optimization loop",
  },
  es: {
    startError: "Error al iniciar el loop de optimizacion",
    timeoutError: "El loop de optimizacion tardo demasiado. Por favor verifica los logs.",
    triggerError: "Error al ejecutar el loop de optimizacion",
  },
};
