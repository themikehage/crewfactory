import type { SupportedLocale } from "@/lib";

export const literals: Record<SupportedLocale, Record<string, string>> = {
  en: {
    addError: "Failed to add agent to channel",
    replyModeUserOnly: "Agent responds only to human messages. Does not trigger other agents.",
    replyModeBroadcast: "Agent responds to human and other agent messages. Triggers all channel members.",
    replyModeTargeted: "Agent responds to human and selected target agents. Triggers specified targets.",
    replyModeMentionOnly: "Agent is silent unless explicitly @mentioned by name or id in a message.",
    adding: "Adding...",
    addToChannel: "Add to Channel",
  },
  es: {
    addError: "Error al agregar agente al canal",
    replyModeUserOnly: "El agente solo responde a mensajes humanos. No activa a otros agentes.",
    replyModeBroadcast: "El agente responde a mensajes humanos y de otros agentes. Activa a todos los miembros.",
    replyModeTargeted: "El agente responde al humano y a agentes seleccionados. Activa objetivos especificos.",
    replyModeMentionOnly: "El agente permanece en silencio a menos que sea @mencionado por nombre o id.",
    adding: "Agregando...",
    addToChannel: "Agregar al Canal",
  },
};
