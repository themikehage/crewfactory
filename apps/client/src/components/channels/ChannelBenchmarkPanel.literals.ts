import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    startError: "Failed to start benchmark runner",
    timeoutError: "Benchmark timed out. Please check server logs.",
    triggerError: "Failed to trigger benchmark suite",
  },
  es: {
    startError: "Error al iniciar el benchmark",
    timeoutError: "El benchmark tardo demasiado. Por favor verifica los logs del servidor.",
    triggerError: "Error al ejecutar el benchmark",
  },
};
