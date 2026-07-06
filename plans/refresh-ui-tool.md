COMPLETED ✅  
# Feature Plan: Herramienta 'refresh_ui' para el Agente

Este documento describe el diseño y la integración de la herramienta oficial `refresh_ui` para los agentes en el ecosistema de CrewFactory.

## Motivación
Anteriormente, cuando los agentes realizaban operaciones autónomas en el servidor como añadir, editar o eliminar entidades (repositorios, agentes, canales, habilidades o experimentos) a través de bash u otras herramientas, el frontend no se enteraba de los cambios inmediatamente. Se requería que el usuario recargara la página para forzar un refresh del sidebar y listas de navegación.
La herramienta `refresh_ui` permite que el agente notifique de manera reactiva al frontend sobre cualquier cambio inmediatamente tras completarse la mutación.

## Arquitectura

### 1. Comunicación por WebSocket
El backend de CrewFactory cuenta con una función `broadcastToUser(username, message)` que envía eventos en tiempo real a las conexiones websocket activas del usuario. Al recibir una llamada de `refresh_ui`, el backend emite:
```json
{
  "type": "entity-updated",
  "entityType": "<repo|agent|channel|experiment|skill|all>"
}
```

### 2. Manejo en el Cliente
El cliente (`ws-client.ts`) capta el evento websocket y despacha un evento personalizado de JavaScript en la ventana (`window`):
```typescript
window.dispatchEvent(new CustomEvent("entity-updated", { detail: { type: data.entityType } }));
```
Componentes React clave como `SessionSidebar.tsx` escuchan este CustomEvent y ejecutan la actualización de sus datos a través de peticiones REST correspondientes (`fetchRepos()`, `fetchAgents()`, etc.), asegurando un refresco reactivo instantáneo.

## Estructura de la Herramienta
- **Nombre:** `refresh_ui`
- **Descripción:** "Notify the frontend interface to refresh a specific section or all sidebar lists (projects/repositories, agents, channels, experiments, custom skills) after making mutations."
- **Parámetros:**
  - `entityType` (string): enum `["repo", "agent", "channel", "experiment", "skill", "all"]`.
- **Implementación del Backend:** Definido en `apps/server/src/core/ui-tools.ts` y provisto de forma forzada a las sesiones de chat generales y de agentes programáticos.

## Componente de Visualización
Se añadió un mapeo en `ToolCallRow.tsx` del cliente para mostrar una card minimalista y premium de estado del sistema:
- **Etiqueta:** `refrescar`
- **Icono:** Icono de flechas circulares de refresco.
- **Card visual:** Un contenedor estilizado en base a los tokens Tailwind CSS v4, que indica al usuario qué secciones del espacio de trabajo acaban de ser actualizadas en tiempo real de forma autónoma por el agente.
