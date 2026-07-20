import type { SupportedLocale } from "@/lib/types";

export const literals = {
  es: {
    avatarLabel: "Avatar",
    removeButton: "Eliminar",
    defaultAvatarsLabel: "Avatares por defecto",
  },
  en: {
    avatarLabel: "Avatar",
    removeButton: "Remove",
    defaultAvatarsLabel: "Default Avatars",
  },
} satisfies Record<SupportedLocale, Record<string, string>>;
