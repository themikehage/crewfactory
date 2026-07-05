import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    appearance: "Appearance",
    mcpLink: "MCP Configuration",
    mcpDesc: "Manage Model Context Protocol servers",
    language: "Language",
  },
  es: {
    appearance: "Apariencia",
    mcpLink: "Configuracion MCP",
    mcpDesc: "Administra servidores Model Context Protocol",
    language: "Idioma",
  },
};
