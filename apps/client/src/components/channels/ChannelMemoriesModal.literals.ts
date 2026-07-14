import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    title: "Channel Memories",
    subtitle: "Persistent memories stored by agents across sessions",
    empty: "No memories yet. Agents will store memories here as they work.",
    recall: "Recall memories...",
    typeLabel: "Type",
    importanceLabel: "Importance",
    tagsLabel: "Tags",
    noQuery: "Search to find relevant memories",
    clearMemories: "Clear Memories",
    clearConfirm: "Are you sure you want to clear all memories in this channel? This action cannot be undone.",
  },
  es: {
    title: "Memorias del Canal",
    subtitle: "Recuerdos persistentes guardados por los agentes entre sesiones",
    empty: "Aún no hay memorias. Los agentes guardarán recuerdos aquí mientras trabajan.",
    recall: "Buscar memorias...",
    typeLabel: "Tipo",
    importanceLabel: "Importancia",
    tagsLabel: "Etiquetas",
    noQuery: "Buscá para encontrar recuerdos relevantes",
    clearMemories: "Borrar Memorias",
    clearConfirm: "¿Estás seguro de que querés borrar todas las memorias de este canal? Esta acción no se puede deshacer.",
  },
};
