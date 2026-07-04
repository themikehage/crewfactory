import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    desktopHint: "Add agents to build your team hierarchy. Leads, seniors, and members will appear here.",
    mobileHint: "Add agents to see the organizational chart with leads, seniors, members, and observers.",
  },
  es: {
    desktopHint: "Agrega agentes para construir tu jerarquia de equipo. Lideres, seniors y miembros apareceran aqui.",
    mobileHint: "Agrega agentes para ver el organigrama con lideres, seniors, miembros y observadores.",
  },
};
