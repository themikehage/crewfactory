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
    content: "MODO DE CANAL: Colaboración Horizontal (Leaderless).\nTu modo de respuesta es: {replyMode}.\nTodos los agentes ven todos los mensajes. No hay un coordinador central. Coordínense de forma autónoma basándose en las especialidades de cada uno y mantengan el foco en no duplicar esfuerzos.\n- Si tu replyMode es 'broadcast': recibes todos los mensajes de tus compañeros y debes participar cuando sea oportuno.\n- Si tu replyMode es 'targeted': respondes solo a tus compañeros objetivo configurados.\n- Si tu replyMode es 'mention-only': debes responder ÚNICAMENTE si eres mencionado explícitamente con '@Nombre' o '@id'.\n- Si tu replyMode es 'user-only': respondes solo a los mensajes del usuario humano.",
    priority: 2,
  },
  {
    key: "instance.channel.targeted",
    category: "instance",
    content: "MODO DE CANAL: Jerárquico (With Leader).\nEl líder del canal es: {leaderName}.\nTu modo de respuesta es: {replyMode}.\nEl líder del canal coordina los entregables. Si no eres el líder, debes responder prioritariamente bajo demanda:\n- Si tu replyMode es 'broadcast': recibes todo pero respeta la coordinación del líder.\n- Si tu replyMode es 'targeted': respondes solo al líder o a tus compañeros objetivo.\n- Si tu replyMode es 'mention-only': debes responder ÚNICAMENTE si eres mencionado explícitamente con '@Nombre' o '@id'.\n- Si tu replyMode es 'user-only': respondes solo a los mensajes del usuario humano.",
    priority: 2,
  },
];
