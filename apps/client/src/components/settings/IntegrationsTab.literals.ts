import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    title: "Integrations Hub",
    subtitle: "Connect your external services and automate workflows.",
    noIntegrations: "No integrations defined.",
  },
  es: {
    title: "Hub de Integraciones",
    subtitle: "Conecta tus servicios externos y automatiza flujos de trabajo.",
    noIntegrations: "No hay integraciones definidas.",
  },
};
