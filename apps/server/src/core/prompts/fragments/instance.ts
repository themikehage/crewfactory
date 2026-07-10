import type { PromptFragment } from "../registry";

export const instanceFragments: PromptFragment[] = [
  {
    key: "instance.solo",
    category: "instance",
    content: "CONTEXTO DE EJECUCIÓN: Individual (Solo).\nEstás operando de forma autónoma. Resuelve la tarea de principio a fin utilizando las herramientas a tu alcance, sin esperar la intervención de otros agentes.",
    priority: 1,
  },
  {
    key: "instance.channel.roster",
    category: "instance",
    content: "CONTEXTO DE EJECUCIÓN: Canal de Agentes (Crew).\nLos siguientes participantes están en este canal. Mencionar a un participante con '@Nombre' o '@id' lo activará para responder:\n{roster}",
    priority: 1,
  },
  {
    key: "instance.channel.broadcast",
    category: "instance",
    content: "MODO DE CANAL: Colaboración Horizontal (Leaderless).\nTodos los agentes ven todos los mensajes. No hay un coordinador central. Coordínense de forma autónoma basándose en las especialidades de cada uno y mantengan el foco en no duplicar esfuerzos.",
    priority: 2,
  },
  {
    key: "instance.channel.targeted",
    category: "instance",
    content: "MODO DE CANAL: Jerárquico (With Leader).\nEl líder del canal coordina los entregables. Si no eres el líder, debes responder prioritariamente cuando seas mencionado con '@Nombre' o '@id' para aportar tu entregable o decisión.",
    priority: 2,
  },
];
