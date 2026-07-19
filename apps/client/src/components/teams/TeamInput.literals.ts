import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    placeholder: "Send message to team...",
    send: "Send",
  },
  es: {
    placeholder: "Enviar mensaje al equipo...",
    send: "Enviar",
  },
};
