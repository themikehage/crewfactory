import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    resetContext: "Reset Context",
    resetConfirm: "Are you sure you want to reset the agent context? This will abort any current execution and start a new session.",
  },
  es: {
    resetContext: "Reiniciar Contexto",
    resetConfirm: "¿Estás seguro de que querés reiniciar el contexto del agente? Esto abortará la ejecución actual y comenzará una nueva sesión.",
  },
};
