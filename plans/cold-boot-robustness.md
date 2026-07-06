# Plan: Cold Boot Robustness & Awaited Session Loading

## Descripción
Este plan describe la solución para optimizar el arranque en frío del servidor CrewFactory al inicializar sesiones que dependen de servidores MCP (Model Context Protocol). Adicionalmente, corrige la condición de carrera en los endpoints HTTP que provocaba que se retornaran listas vacías de mensajes antes de que la sesión terminara de cargarse por completo.

## Motivación
- **Latencia de Arranque:** Los servidores MCP se ejecutan mediante `bunx`. En un arranque en frío, esto provoca que `bunx` descargue los paquetes de internet, tardando entre 10 y 18 segundos.
- **Conexiones Caídas (Timeout):** La respuesta tardaba más del timeout límite del proxy HTTP (10 segundos), provocando un error de socket (`socket hang up`) en el cliente.
- **Interfaz Vacía:** Dado que las solicitudes HTTP se realizan en paralelo al montar el chat, el endpoint `/api/sessions/:id/messages` consultaba la memoria de forma no síncrona. Al estar la sesión aún en carga por el retraso de MCP, se retornaba una lista vacía de mensajes (`[]`), forzando al usuario a refrescar la página manualmente para ver sus mensajes reales.

## Enfoque Técnico
1. **Carga en Segundo Plano (Asíncrona y No Bloqueante):** 
   En lugar de esperar a que los servidores MCP se conecten durante la creación de la sesión (`getOrCreateSession`), la sesión se crea inmediatamente con las herramientas básicas. Se inicia una promesa en segundo plano que conecta los servidores MCP.
2. **Inyección Dinámica de Herramientas:**
   Una vez que la promesa en segundo plano resuelve, las herramientas descubiertas se añaden directamente al array de `_customTools` del objeto `session` y se llama al método `_refreshToolRegistry()` de la SDK del agente para activarlas en caliente.
3. **Mantenimiento del Contexto en el System Prompt:**
   Para que el System Prompt del agente liste las herramientas MCP correctas desde el primer instante sin tener que esperar a que conecten los servidores, se leen los nombres de herramientas desde la caché local en `mcp-servers.json` (que guarda las herramientas que funcionaron en la última ejecución exitosa).
4. **Control de Tiempos de Espera (Timeouts) en MCP:**
   Se mantiene el mecanismo de timeout (5 segundos) en `McpClient.request` mediante `Promise.race` para evitar que un subproceso MCP roto o lento cuelgue la cola de tareas en segundo plano.
5. **Sincronización de Rutas HTTP con Carga de Sesiones:**
   Las rutas críticas (`/messages`, `/context`, `/tools`, `/model`, `/navigate`) en `sessions.ts` continúan utilizando `await piSessionManager.getOrCreateSession(...)`. Dado que la creación del objeto de sesión ahora es instantánea (no bloqueada por la red de MCP), el cliente recibe su historial de mensajes de inmediato sin incurrir en timeouts ni condiciones de carrera.

## Verificación
- Verificación de compilación sin errores mediante `tsc --noEmit`.
- Verificación de carga instantánea de sesión y posterior inyección asíncrona de herramientas.
- Verificación manual abriendo sesiones tras reinicios en frío del servidor.
