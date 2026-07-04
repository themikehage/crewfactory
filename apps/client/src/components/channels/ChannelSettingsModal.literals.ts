import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    invalidJsonNegotiation: "Invalid JSON in Negotiation Protocol",
    invalidJsonRubric: "Invalid JSON in Scoring Rubric",
    invalidJsonDelegation: "Invalid JSON in Delegation Pattern",
    updateError: "Failed to update channel settings",
    saving: "Saving...",
    saveSettings: "Save Settings",
  },
  es: {
    invalidJsonNegotiation: "JSON invalido en Protocolo de Negociacion",
    invalidJsonRubric: "JSON invalido en Rubrica de Evaluacion",
    invalidJsonDelegation: "JSON invalido en Patron de Delegacion",
    updateError: "Error al actualizar la configuracion del canal",
    saving: "Guardando...",
    saveSettings: "Guardar Ajustes",
  },
};
