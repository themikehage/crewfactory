import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    channelNotFound: "Channel not found",
    backToChannels: "Back to Channels",
  },
  es: {
    channelNotFound: "Canal no encontrado",
    backToChannels: "Volver a Canales",
  },
};
