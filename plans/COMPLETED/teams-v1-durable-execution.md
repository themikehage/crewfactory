COMPLETED
# Teams v1: ejecución multiagente durable

## Objetivo

Entregar equipos multiagente robustos en paralelo a Channels, con dos topologías: líder y especialistas, y mesa redonda con facilitador.

## Implementación

- Dominio, rutas y persistencia aislados bajo `teams/`; Channels no comparte orquestador ni contratos de ejecución.
- Cada tarea crea una ejecución durable con snapshot de equipo, versión de configuración, `requestId` idempotente, pasos, eventos secuenciados y terminal explícito.
- El líder planifica, los especialistas aportan y el líder entrega; en mesa redonda los participantes aportan y el facilitador entrega.
- La ejecución registra texto y herramientas, aplica reintentos acotados, permite cancelación y marca trabajo abierto como interrumpido tras reinicio.
- La UI `/teams` y `/teams/:id` reutiliza el cliente WebSocket y patrones del chat para mostrar configuración, timeline, actividad de herramientas y entrega final.

## Verificación

- Pruebas de contrato de topologías y de eventos persistentes/idempotencia/recuperación.
- Build de producción de servidor y cliente.
