import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    tabProviders: "LLM Providers",
    tabEnv: "Env Variables",
    tabIntegrations: "Integrations Hub",
    tabMcp: "MCP Servers",
    tabGeneral: "General & Account",
  },
  es: {
    tabProviders: "LLM Providers",
    tabEnv: "Variables de Entorno",
    tabIntegrations: "Hub de Integraciones",
    tabMcp: "Servidores MCP",
    tabGeneral: "General y Cuenta",
  },
};
