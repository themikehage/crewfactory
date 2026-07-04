import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    deleteChannel: "Delete Channel",
    manageContext: "Manage context variables",
    manageMembers: "Manage channel members",
  },
  es: {
    deleteChannel: "Eliminar Canal",
    manageContext: "Gestionar variables de contexto",
    manageMembers: "Gestionar miembros del canal",
  },
};
