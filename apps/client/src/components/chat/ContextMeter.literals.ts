import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    refresh: "Refresh context usage",
    compacting: "Compacting...",
    compact: "Compact",
    title: "Context usage",
    usedLabel: "used",
    inputLabel: "Input",
    outputLabel: "Output",
    remainingLabel: "Remaining",
    limitLabel: "Limit",
    compactAction: "Compact conversation",
    compactingAction: "Compacting...",
    compactDesc: "Summarize older messages to free up context space",
    noData: "No context data",
  },
  es: {
    refresh: "Actualizar uso de contexto",
    compacting: "Compactando...",
    compact: "Compactar",
    title: "Uso de contexto",
    usedLabel: "usado",
    inputLabel: "Entrada",
    outputLabel: "Salida",
    remainingLabel: "Restante",
    limitLabel: "Limite",
    compactAction: "Compactar conversacion",
    compactingAction: "Compactando...",
    compactDesc: "Resume mensajes antiguos para liberar espacio",
    noData: "Sin datos de contexto",
  },
};
