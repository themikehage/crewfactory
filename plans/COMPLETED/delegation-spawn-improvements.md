COMPLETED
# Plan: Mejoras en la Experiencia de Delegación y Spawn de Subagentes

Este plan documenta el rediseño y las correcciones sobre el comportamiento de navegación y visualización de subagentes delegados en CrewFactory.

## Motivación
Actualmente, al invocar herramientas de delegación o spawn:
1. El frontend fuerza la navegación inmediata del usuario hacia la sesión del subagente. Esto interrumpe el flujo principal de chat del usuario en el agente padre.
2. Dentro de una sesión delegada (especialmente las creadas por `delegate_task`), falta el botón de retorno a la sesión padre debido a metadatos incompletos de persistencia.
3. El listado de delegaciones activas se muestra sobre el primer mensaje del chat, lo que ensucia la interfaz del chat principal y limita el espacio de lectura.

## Propuesta de Diseño
1. **Permanecer en la sesión padre**: Evitar la navegación forzada en el cliente cuando se recibe el evento `delegation_started`.
2. **Botón de retorno robusto**: Guardar la propiedad `parentSessionId` en los metadatos de las sesiones con prefijo `del_` en el servidor, de manera que el banner superior del cliente muestre siempre el botón "Volver a la Sesión Padre".
3. **Nueva pestaña "Delegaciones"**:
   - Crear una pestaña contextual junto a "Chat" y "Archivos" (Files) llamada "Delegaciones" (o "Delegations" en inglés).
   - Renderizar un panel completo (`DelegationsPanel.tsx`) que realice fetch de las delegaciones de la sesión activa y escuche cambios por WebSocket.
   - Mostrar un estado de carga y un estado vacío interactivo si no hay sesión iniciada.

## Beneficios
- **Mayor fluidez conversacional**: El usuario no es transportado a una subsesión contra su voluntad.
- **Mejor navegación**: Volver al flujo principal es inmediato y fácil en todas las subsesiones.
- **Organización espacial**: El chat permanece limpio, y el seguimiento de tareas concurrentes se centraliza en su propia pestaña dedicada.
