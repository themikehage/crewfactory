import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    morningGreeting: "Good morning",
    afternoonGreeting: "Good afternoon",
    eveningGreeting: "Good evening",
    defaultPlaceholder: "Type / for skills or ask a question...",
    voiceInputMock: "Voice Input is not configured",
    modelLabel: "Generator Model:",
  },
  es: {
    morningGreeting: "Buenos días",
    afternoonGreeting: "Buenas tardes",
    eveningGreeting: "Buenas noches",
    defaultPlaceholder: "Escribí / para habilidades o hacé una pregunta...",
    voiceInputMock: "La entrada de voz no está configurada",
    modelLabel: "Modelo Generador:",
  },
};
