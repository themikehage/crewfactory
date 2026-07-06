# Plan: Cold Boot Robustness & Awaited Session Loading

## Descripción
Este plan describe la solución para optimizar el arranque en frío del servidor CrewFactory al inicializar sesiones que dependen de servidores MCP (Model Context Protocol). Adicionalmente, corrige la condición de carrera en los endpoints HTTP que provocaba que se retornaran listas vacías de mensajes antes de que la sesión terminara de cargarse por completo.

## Motivación
- **Latencia de Arranque:** Los servidores MCP se ejecutan mediante `bunx`. En un arranque en frío, esto provoca que `bunx` descargue los paquetes de internet, tardando entre 10 y 18 segundos.
- **Conexiones Caídas (Timeout):** La respuesta tardaba más del timeout límite del proxy HTTP (10 segundos), provocando un error de socket (`socket hang up`) en el cliente.
- **Interfaz Vacía:** Dado que las solicitudes HTTP se realizan en paralelo al montar el chat, el endpoint `/api/sessions/:id/messages` consultaba la memoria de forma no síncrona. Al estar la sesión aún en carga por el retraso de MCP, se retornaba una lista vacía de mensajes (`[]`), forzando al usuario a refrescar la página manualmente para ver sus mensajes reales.

## Enfoque Técnico
1. **Cache de Dependencias de MCP:** 
   Agregar `@modelcontextprotocol/server-filesystem` y `@modelcontextprotocol/server-memory` como dependencias explícitas en `apps/server/package.json`. Esto pre-descarga e instala los paquetes en local (en `node_modules`), permitiendo que `bunx` los ejecute instantáneamente sin acceso a la red.
2. **Inicialización Paralela de MCP:**
   Refactorizar `getSessionMcpTools` en `mcp-registry.ts` para conectar los clientes MCP usando `Promise.all` en lugar de una secuencia de bucle `for`, optimizando la inicialización paralela.
3. **Control de Tiempos de Espera (Timeouts) en MCP:**
   Añadir un parámetro y mecanismo de timeout (5 segundos) en `McpClient.request` mediante `Promise.race` para evitar que un proceso MCP bloqueado cuelgue de forma indefinida el inicio de la sesión del agente.
4. **Sincronización de Rutas HTTP con Carga de Sesiones:**
   Modificar las rutas críticas de `/api/sessions/:id/...` (`/messages`, `/context`, `/tools`, `/model`, `/navigate`) en `sessions.ts` para que utilicen `await piSessionManager.getOrCreateSession(...)` en lugar de `piSessionManager.getSession(...)`. De esta manera, si la sesión se está inicializando o está en proceso de carga desde el disco, la solicitud HTTP esperará a que termine y retornará los datos correctos en lugar de responder inmediatamente con arrays vacíos o fallas de 404.

## Verificación
- Verificación de compilación sin errores mediante `tsc --noEmit`.
- Verificación manual abriendo sesiones tras reinicios en frío del servidor.
