import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    levelLead: "Leads",
    levelSenior: "Seniors",
    levelMember: "Members",
    levelObserver: "Observers",
  },
  es: {
    levelLead: "Lideres",
    levelSenior: "Seniors",
    levelMember: "Miembros",
    levelObserver: "Observadores",
  },
};
