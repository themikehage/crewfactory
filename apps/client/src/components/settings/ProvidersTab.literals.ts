import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    title: "Providers",
    subtitle: "Configure API keys for LLM providers to use with the coding agent.",
    searchPlaceholder: "Search providers...",
    infoBtn: "Info",
    syncBtn: "Sync",
    modalTitle: "Models for {provider}",
    modalSubtitle: "Catalog of available models and execution capabilities configured in CrewFactory.",
    thName: "Name",
    thId: "ID",
    thContext: "Context",
    thCapabilities: "Capabilities",
    closeBtn: "Close",
  },
  es: {
    title: "Proveedores",
    subtitle: "Configura las claves de API para usar con el agente.",
    searchPlaceholder: "Buscar proveedores...",
    infoBtn: "Info",
    syncBtn: "Sincronizar",
    modalTitle: "Modelos de {provider}",
    modalSubtitle: "Catálogo de modelos disponibles y capacidades de ejecución configuradas en CrewFactory.",
    thName: "Nombre",
    thId: "ID",
    thContext: "Contexto",
    thCapabilities: "Capacidades",
    closeBtn: "Cerrar",
  },
};
