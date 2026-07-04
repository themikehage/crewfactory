import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    auto: "Auto-detect",
    next: "Next.js",
    astro: "Astro",
    html: "Static HTML",
    custom: "Custom",
    configure: "Configure Preview",
    reload: "Reload preview",
    openTab: "Open in new tab",
    buildNow: "Build Now",
    building: "Building...",
  },
  es: {
    auto: "Auto-detectar",
    next: "Next.js",
    astro: "Astro",
    html: "HTML Estatico",
    custom: "Personalizado",
    configure: "Configurar Preview",
    reload: "Recargar preview",
    openTab: "Abrir en nueva pestana",
    buildNow: "Construir Ahora",
    building: "Construyendo...",
  },
};
