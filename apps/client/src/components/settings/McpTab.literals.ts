import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    title: "Model Context Protocol (MCP)",
    subtitle: "Configure MCP servers to extend the agent capabilities.",
    noServers: "No MCP servers configured.",
    active: "Active",
    enabled: "Enabled",
    disabled: "Disabled",
    command: "Command",
    arguments: "Arguments (JSON Array)",
    enterValue: "Enter value",
  },
  es: {
    title: "Model Context Protocol (MCP)",
    subtitle: "Configura servidores MCP para extender las capacidades del agente.",
    noServers: "No hay servidores MCP configurados.",
    active: "Activo",
    enabled: "Habilitado",
    disabled: "Deshabilitado",
    command: "Comando",
    arguments: "Argumentos (Array JSON)",
    enterValue: "Ingresa un valor",
  },
};
