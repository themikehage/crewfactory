import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    tabChat: "Chat",
    tabFiles: "Files",
    tabPreview: "Preview",
    tabHistory: "History",
    breadProyectos: "Projects",
    breadAgentes: "Agents",
    breadCanales: "Channels",
    breadFactory: "Factory",
    breadSettings: "Settings",
    breadSkills: "Skills",
    breadLogs: "Logs",
    breadMcps: "MCP Marketplace",
  },
  es: {
    tabChat: "Chat",
    tabFiles: "Archivos",
    tabPreview: "Preview",
    tabHistory: "Historial",
    breadProyectos: "Proyectos",
    breadAgentes: "Agentes",
    breadCanales: "Canales",
    breadFactory: "Factory",
    breadSettings: "Settings",
    breadSkills: "Skills",
    breadLogs: "Logs",
    breadMcps: "MCP Marketplace",
  },
};
