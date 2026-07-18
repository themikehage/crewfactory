COMPLETED
# Plan: Sistema de Equipos Colaborativos (Teams)

Este plan detalla el diseño, la persistencia y la orquestación síncrona y secuencial del nuevo módulo de **Teams** (Fase 1 a 7) para ofrecer una alternativa robusta y fácil de mantener frente a las complejidades heredadas del sistema de canales.

---

## Objetivos
1. Permitir la creación de equipos con topologías `leader_specialists` y `roundtable`.
2. Habilitar la orquestación limpia sin recursiones, controlada mediante un único `AbortController` por ejecución.
3. Garantizar persistencia robusta de runs y mensajes, permitiendo el replay tras desconexiones de WebSocket.
4. Paridad de experiencia de usuario en la interfaz frontend mediante progress bars live, modal de creación interactivo e integración en el sidebar.

---

## Arquitectura

### 1. Persistencia
- **Definición de Equipos**: Almacenados en `/tmp/crewfactory/{username}/workspace/teams/{teamId}/definition.json`.
- **Sesiones**: `/tmp/crewfactory/{username}/workspace/teams/{teamId}/sessions/{sessionId}/messages.jsonl`.
- **Historial de Ejecuciones (Runs)**: `/tmp/crewfactory/{username}/workspace/teams/{teamId}/runs/{runId}/events.jsonl` (para logs y replay).

### 2. El Loop Secuencial (`TeamRunner`)
- Utiliza una cola síncrona `queue` que almacena los agentes que deben intervenir en el turno.
- Resuelve el siguiente miembro a actuar basándose en la topología:
  - En `roundtable`, actúan secuencialmente uno tras otro en orden.
  - En `leader_specialists`, el líder actúa primero, delega a los especialistas y vuelve al líder para consolidar el reporte.
- El ciclo completo es cancelable de inmediato mediante `AbortController.abort()`.
