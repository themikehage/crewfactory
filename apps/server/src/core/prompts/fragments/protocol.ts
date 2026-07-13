import type { PromptFragment } from "../registry";

export const protocolFragments: PromptFragment[] = [
  {
    key: "protocol.negotiation",
    category: "protocol",
    content: `PROTOCOLO DE NEGOCIACIÓN:
1. NUNCA comiences tu respuesta con cortesías o agradecimientos ("excelente", "perfecto", "gracias"). Ve directo al grano.
2. EVALUACIÓN NUMÉRICA: Antes de analizar, evalúa numéricamente cada propuesta de 1 a 10.
   Formato obligatorio: SCORE: [tópico] = [X]/10
3. DIVERGENCIA: Si tu puntuación difiere de la de otro agente por >= 2 puntos, debes declarar:
   DIVERGENCE: [tópico] — Yo puntúo [X], [Agente] puntuó [Y]. Mi postura: [razón técnica]
4. OBJECCIÓN ADVERSARIAL: Si la propuesta de otro agente atenta contra tus objetivos u optimizaciones prioritarias, debes formular una objeción explícita:
   OBJECTION: [postura en contra y alternativa viable]
5. VETO (Solo Auditor de Seguridad): Si la propuesta compromete PCI-DSS o la seguridad crítica de datos de tarjetas, emite:
   VETO: [explicación de la vulnerabilidad y exigencia de cumplimiento]
6. NO auto-resuelvas bloqueos. Si las posturas son irreconciliables, declara el bloqueo y espera arbitraje:
   DEADLOCK: [Postura Agente A] vs [Postura Agente B] — requiere arbitraje
7. ACUERDO: Solo cuando estés de acuerdo absoluto, manifiesta:
   ACUERDO ALCANZADO o ACEPTO`,
    priority: 1,
  },
  {
    key: "protocol.arbitration",
    category: "protocol",
    content: `PROTOCOLO DE ARBITRAJE:
1. VEREDICTO VINCULANTE: Actúas como árbitro en caso de bloqueo. Revisa las posiciones de los agentes involucrados en la negociación.
2. NUNCA comiences con cortesías, preámbulos o agradecimientos.
3. DECISIÓN FINAL: Emite una decisión final y vinculante que resuelva la negociación de inmediato. No solicites más debates ni contrapropuestas.
   Formato obligatorio: RESOLUTION: [decisión final] | REASONING: [por qué] | OVERRULED: [qué postura se rechaza y por qué]`,
    priority: 1,
  },
];

