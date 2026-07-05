import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    themeLabel: "Theme",
    dark: "Dark",
    light: "Light",
    system: "System",
  },
  es: {
    themeLabel: "Tema",
    dark: "Oscuro",
    light: "Claro",
    system: "Sistema",
  },
};
