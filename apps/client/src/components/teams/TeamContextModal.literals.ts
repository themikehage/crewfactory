import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    saveError: "Failed to save team context",
    keyPlaceholder: "KEY (e.g. API_URL)",
    valuePlaceholder: "Value (e.g. https://api.staging.com)",
    deleteVar: "Delete variable",
    saving: "Saving...",
    saveContext: "Save Context",
    emptyContext: "No context variables configured for this team.",
    addVar: "Add Context Variable",
    description: "Define key-value variables that agents will know when responding in this team",
  },
  es: {
    saveError: "Error al guardar el contexto del equipo",
    keyPlaceholder: "CLAVE (ej. API_URL)",
    valuePlaceholder: "Valor (ej. https://api.staging.com)",
    deleteVar: "Eliminar variable",
    saving: "Guardando...",
    saveContext: "Guardar Contexto",
    emptyContext: "No hay variables de contexto configuradas para este equipo.",
    addVar: "Añadir Variable de Contexto",
    description: "Define variables clave-valor que los agentes conocerán al responder en este equipo",
  },
};
