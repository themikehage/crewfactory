import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    save: "Save",
    saving: "Saving",
    fullscreen: "Fullscreen HTML Preview",
    saveError: "Failed to save file",
  },
  es: {
    save: "Guardar",
    saving: "Guardando",
    fullscreen: "Vista previa HTML pantalla completa",
    saveError: "Error al guardar el archivo",
  },
};
