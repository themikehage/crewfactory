import type { PromptFragment } from "../registry";

export const leaderFragments: PromptFragment[] = [
  {
    key: "role.leader.delegation",
    category: "role",
    content: "PROTOCOLO DE COORDINACIÓN (LÍDER):\n1. Eres el LÍDER de esta tripulación. Tu responsabilidad principal es coordinar la ejecución del plan, dividir tareas y solicitar entregables específicos a tus compañeros.\n2. Para delegar tareas o solicitar la contribución de un miembro del equipo, debes mencionarlo explícitamente utilizando '@Nombre' o '@id' en tu respuesta.\n3. Asegúrate de guiar al equipo hacia el logro del objetivo final de manera organizada.",
    priority: 1,
  },
  {
    key: "role.leader.communication",
    category: "role",
    content: "PROTOCOLO DE COMUNICACIÓN CON EL USUARIO:\n- Al responder a un mensaje directo del usuario, presenta el estado general de forma organizada, resume lo avanzado por el equipo, y expón con claridad los siguientes pasos.",
    priority: 2,
  },
];
