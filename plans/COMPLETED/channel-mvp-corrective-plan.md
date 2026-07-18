# Plan correctivo: Canal MVP robusto

## Objetivo

Entregar una colaboración multiagente mínima que sea segura, predecible y recuperable. La prioridad no es preservar todas las variantes actuales de orquestación: es que el usuario pueda enviar una tarea a un canal, observar un resultado coherente y conocer el estado final aunque recargue, se desconecte o cancele.

## Decisión de producto

Durante el hardening el canal opera en **modo MVP**:

1. Un canal/sesión admite una sola ejecución activa.
2. Cada mensaje de usuario crea una ejecución identificada e inmutable.
3. Los destinatarios se resuelven una vez al inicio y se ejecutan en orden estable, una vez cada uno.
4. Las respuestas de agentes se publican en ese orden y no inician rondas recursivas.
5. Cancelar termina la ejecución y todos sus turnos pendientes; nunca afecta otra ejecución.

La segunda solicitud mientras exista una ejecución activa recibe `409 channel_busy` con el identificador de la ejecución activa. No se encola en el servidor en esta fase: rechazar explícitamente es más comprensible y evita trabajo sorpresa o mezclas de contexto.

## Flujos MUST

### 1. Acceso y suscripción aislados

- HTTP y WebSocket validan que el canal pertenece al usuario antes de leer, unirse, enviar o abortar.
- La suscripción WebSocket queda ligada a `username + channelId`; los broadcasts nunca atraviesan ese límite.
- Un ID inexistente o ajeno no revela actividad, mensajes ni estado de streaming.

**Criterio de aceptación:** un usuario no puede unirse, observar ni cancelar un canal de otro usuario, incluso si conoce su ID.

### 2. Envío determinista

- La API/WS valida el mensaje, la existencia del canal y que no haya ejecución activa para ese canal/sesión.
- El servidor crea el snapshot durable antes de aceptar el trabajo y devuelve/publica `execution_started` con `executionId`.
- Los destinatarios y su orden se congelan en el snapshot de ejecución.
- El scheduler MVP es exclusivamente `sequential`; cada destinatario elegible obtiene como máximo un turno.
- Cada turno tiene estado terminal único: `completed`, `failed`, `skipped` o `aborted`.

**Criterio de aceptación:** dos envíos rápidos no pueden compartir controlador, contador, eventos, turnos ni estado terminal.

### 3. Proyección coherente de mensajes y eventos

- Cada evento durable contiene `username`, `channelId`, `sessionId` y `executionId` en la envoltura de transporte o se filtra inequívocamente antes de aplicarse.
- Un mensaje de agente se persiste y se publica una sola vez antes de marcar su turno como completado.
- El cliente aplica eventos por `(channelId, sessionId, executionId, sequence)` y descarta los ajenos, duplicados o fuera de secuencia.
- Un terminal de turno o ejecución elimina el estado de streaming correspondiente.

**Criterio de aceptación:** navegar entre canales, reconectar o recibir eventos retrasados no mezcla contenido ni deja agentes escribiendo indefinidamente.

### 4. Cancelación y errores explícitos

- `abort` se dirige por `executionId`, no por un mapa global ambiguo de canal/sesión.
- El aborto es idempotente: repetirlo conserva el mismo terminal y no modifica otra ejecución.
- Fallos de agente, agente no disponible y límites operativos se persisten como resultado visible, no solo en logs.
- El input se bloquea mientras la ejecución está activa y vuelve a habilitarse al llegar a un estado terminal.

**Criterio de aceptación:** el usuario siempre puede distinguir entre completado, cancelado, fallo y rechazo por canal ocupado.

### 5. Recarga, reconexión y reinicio

- Al abrir un canal, el cliente carga el último snapshot de la sesión y sus eventos desde un cursor; el snapshot es la fuente de verdad, WebSocket solo acelera la vista en vivo.
- La reconstrucción muestra mensajes y resultados terminales, pero solo muestra streaming para turnos realmente abiertos.
- Al iniciar el servidor, las ejecuciones no terminales se marcan de forma determinista como `stalled`/`interrupted` y sus turnos abiertos se cierran. El MVP no pretende reanudar llamadas LLM tras reinicio.

**Criterio de aceptación:** una recarga o reinicio no produce ejecuciones zombie, duplicados ni indicadores de streaming fantasma.

### 6. Configuración segura mientras se ejecuta

- No se permite cambiar miembros, topología, política o scheduler durante una ejecución activa; la API devuelve conflicto explícito.
- Cualquier cambio que altere destinatarios, rol o prompt incrementa una única vez la versión de configuración.
- El snapshot conserva la configuración efectiva usada, para que la ejecución sea auditable aunque el canal cambie después.

**Criterio de aceptación:** un turno nunca se ejecuta con una mezcla de configuración antigua y nueva.

## Alcance de interfaz MVP

- Crear/editar un canal con nombre y miembros.
- Enviar una tarea, ver el turno activo y las respuestas ordenadas.
- Ver estado de ejecución: activo, completado, completado con errores, cancelado o interrumpido.
- Cancelar la ejecución activa.
- Recargar y consultar el último resultado sin perder consistencia.

## Nice to have: explícitamente fuera de la ruta crítica

- Schedulers `parallel` y `leader-gated`.
- Broadcast legacy y rondas recursivas entre agentes.
- Negociación, divergencia, arbitraje y resolución automática.
- Topologías guiadas avanzadas, editor de flujo, importación/exportación y migración de `replyMode`.
- Políticas de contribución/final owner, inspector de prompt y métricas de conformidad.
- Streaming de thinking, herramientas y tokens; para el MVP basta con estado de turno y respuesta final.
- Benchmarks, experimentos/laboratorio, analítica de costes y comparativas multiagente.
- Colas persistentes, reanudación tras reinicio y ejecución distribuida.

Estas capacidades pueden mantenerse detrás de un feature flag o mostrarse como no disponibles, pero no deben modificar el scheduler ni el contrato de eventos del modo MVP.

## Plan de implementación

### Fase 161A — Contrato único y aislamiento

- Introducir una clave de ejecución con `username`, `channelId`, `sessionId` y `executionId`; eliminar la atribución implícita desde mapas globales.
- Validar ownership en todos los comandos WS y rutas HTTP de canal.
- Añadir `executionId` al protocolo de `send`, `abort`, eventos y suscripciones cuando aplique.
- Pruebas de aislamiento multiusuario y de abortar solo la ejecución propia.

### Fase 161B — Scheduler MVP

- Implementar guardia de una ejecución activa y respuesta `409 channel_busy`.
- Reducir el flujo MVP a destinatarios congelados, secuenciales y no recursivos.
- Desactivar o separar de forma explícita broadcast, paralelo, negociación y arbitraje.
- Añadir pruebas de doble envío, orden estable, fallo de agente y cancelación.

### Fase 161C — Durabilidad y recuperación

- Hacer atómica la transición snapshot/evento o implementar un journal recuperable que repare transiciones incompletas.
- Completar la proyección durable de todos los turnos MVP.
- En inicio, finalizar ejecuciones abandonadas como `interrupted`/`stalled`.
- Probar reinicio entre `turn_started`, proyección de mensaje y terminal.

### Fase 161D — Cliente como proyección del snapshot

- Filtrar cada evento por canal, sesión y ejecución antes de reducirlo.
- Hacer que terminales eliminen streams; reemplazar, no fusionar, el snapshot de streaming tras recuperar.
- Bloquear acciones incompatibles en UI y mostrar errores/terminales accionables.
- Pruebas de cambio de canal, reconexión, replay duplicado y evento tardío.

### Fase 161E — Configuración y entrega

- Bloquear mutaciones de configuración mientras exista una ejecución activa.
- Corregir el incremento único de `policyVersion` para miembros, topología, política y contexto.
- Ejecutar pruebas de integración HTTP/WS, build de servidor y cliente, y una prueba manual de los seis flujos MUST.
- Mantener el modo avanzado tras un feature flag hasta que disponga de la misma matriz de pruebas.

## Matriz mínima de verificación

| Caso | Resultado esperado |
|---|---|
| Envío normal con varios miembros | Una ejecución, turnos secuenciales ordenados y terminal visible. |
| Doble clic/envío concurrente | Solo una ejecución; el segundo recibe `channel_busy`. |
| Cancelación durante turno | Esa ejecución y sus turnos abiertos terminan como abortados; ningún otro canal cambia. |
| Desconexión y recarga | Se reconstruyen mensajes y estado real; no hay streams fantasma. |
| Reinicio de servidor | Las ejecuciones abiertas quedan `interrupted`/`stalled`, no `running`. |
| Dos usuarios y un ID conocido | No hay suscripción, lectura ni aborto cruzados. |
| Cambio de configuración durante ejecución | `409`; al finalizar, el cambio incrementa exactamente una versión. |

## Condición de salida

El modo MVP se considera listo cuando los seis flujos MUST tienen pruebas automatizadas de servidor y cliente, las verificaciones de la matriz pasan, y las funcionalidades avanzadas no pueden activarse accidentalmente en el camino de ejecución MVP.
