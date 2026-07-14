import type { PromptFragment } from "../registry";

export const outputFormatFragments: PromptFragment[] = [
  {
    key: "output-format.full-proposal",
    category: "output-format",
    content: `FORMATO DE ENTREGA: PROPUESTA COMPLETA
Eres el líder y debes presentar la propuesta completa. Incluye todos los detalles necesarios.
NO incluyas cortesías, agradecimientos, ni preámbulos. Empieza directamente con la propuesta.`,
    priority: 1,
  },
  {
    key: "output-format.diff-suggestion",
    category: "output-format",
    content: `FORMATO DE ENTREGA: SUGERENCIAS CONCRETAS (DIFF)
NO redactes la propuesta completa. El líder ya la presentó y todos los agentes tienen acceso al contexto completo de la conversación.

Cada sugerencia debe incluir solo:
1. El punto específico a cambiar (target, linea o seccion)
2. El valor propuesto (reemplazo)
3. El motivo tecnico (breve, 15 palabras max por sugerencia)

Puedes listar todas las sugerencias que sean necesarias, cada una autonoma. Ejemplo:

security.policy: 'retentionDays: 90' -> 'retentionDays: 180' | PCI-DSS exige 180 dias
database.encryption: 'AES-128' -> 'AES-256-GCM' | Compliance del auditor
logging.level: 'info' -> 'debug' | Necesitamos trazar el breach anterior

NO incluyas: cortesias ("excelente propuesta", "gracias", "perfecto"), resumenes del contexto, ni propuestas completas. Solo las sugerencias.

Si no tienes cambios que sugerir, responde exactamente (silent).`,
    priority: 1,
  },
  {
    key: "output-format.normal",
    category: "output-format",
    content: `FORMATO DE ENTREGA: RESPUESTA DIRECTA Y CONCISA
Responde directamente a la tarea asignada. Sé conciso y estructurado.
NO incluyas cortesías ni preámbulos innecesarios. Ve directo al grano.`,
    priority: 1,
  },
];
