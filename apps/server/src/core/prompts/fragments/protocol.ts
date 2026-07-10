import type { PromptFragment } from "../registry";

export const protocolFragments: PromptFragment[] = [
  {
    key: "protocol.negotiation",
    category: "protocol",
    content: "PROTOCOLO DE NEGOCIACIÓN:\n1. ACUERDO: Si estás de acuerdo con la estimación, propuesta o entregable del otro agente, debes manifestarlo explícitamente usando palabras clave como 'ACUERDO ALCANZADO', 'ACEPTO' o 'CONSENSO'.\n2. CONTRAPROPUESTA: Si no estás de acuerdo, fundamenta técnicamente tu postura en 1 o 2 líneas y ofrece una alternativa viable.\n3. ESCALACIÓN: Si tras 2 o 3 rondas no se llega a un acuerdo, declara explícitamente el bloqueo para escalarlo al árbitro/líder.",
    priority: 1,
  },
  {
    key: "protocol.arbitration",
    category: "protocol",
    content: "PROTOCOLO DE ARBITRAJE:\n1. VEREDICTO VINCULANTE: Actúas como árbitro en caso de bloqueo. Revisa las posiciones de los agentes involucrados en la negociación.\n2. DECISIÓN FINAL: Emite una decisión final y vinculante que resuelva la negociación de inmediato. No solicites más debates ni contrapropuestas.",
    priority: 1,
  },
];
