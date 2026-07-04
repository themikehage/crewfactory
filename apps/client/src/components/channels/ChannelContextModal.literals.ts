import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    saveError: "Failed to save channel context",
    keyPlaceholder: "KEY (e.g. API_URL)",
    valuePlaceholder: "Value (e.g. https://api.staging.com)",
    deleteVar: "Delete variable",
    saving: "Saving...",
    saveContext: "Save Context",
  },
  es: {
    saveError: "Error al guardar el contexto del canal",
    keyPlaceholder: "CLAVE (ej. API_URL)",
    valuePlaceholder: "Valor (ej. https://api.staging.com)",
    deleteVar: "Eliminar variable",
    saving: "Guardando...",
    saveContext: "Guardar Contexto",
  },
};
