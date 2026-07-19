# Refactor de AppRouter con React Router

## Objetivo

Sustituir el router manual basado en `window.history` por `react-router-dom` y dividir las responsabilidades actualmente concentradas en `AppRouter.tsx`. El resultado debe conservar todas las URLs existentes, la navegación atrás, la restauración tras recarga y los flujos de proyecto, agente, canal, equipo, laboratorio y sesiones.

## Diagnóstico

- `components/layout/AppRouter.tsx` concentra autenticación, selección y persistencia de contexto, historial interno, estado y operaciones de laboratorio, modales globales y el renderizado de todas las páginas.
- `hooks/useRouter.ts` implementa manualmente el parseo de URLs y la navegación. Cada consumidor crea su propia instancia; para propagar una navegación se dispara un evento `popstate` sintético después de `pushState`.
- Las rutas de contexto se repiten para proyectos, agentes, canales y equipos. El estado de contexto se duplica entre parámetros de URL, `localStorage` y estado de `AppRouter`, con cuatro handlers casi equivalentes.
- La URL admite IDs de sesión con segmentos adicionales (`remaining.join("/")`), por lo que una migración debe usar splats y no asumir que todos los IDs son un único segmento.
- El estado de laboratorio es independiente del enrutado y puede aislarse en un controlador/hook propio. También contiene un `any[]` que debe sustituirse por el tipo de ejecución apropiado durante la extracción.

## Alcance y compatibilidad

Se mantendrán sin redirecciones destructivas las rutas actuales: `/`, `/session/*`, `/projects/:projectId/*`, `/agents/:agentId/*`, `/channels/:channelId/*`, `/teams/:teamId/*`, las páginas administrativas, `/laboratory`, `/laboratory/session/*`, `/pipelines/:pipelineId/runs/:runId` y el alias `/mcps` hacia Settings/MCP. Se conservará el contrato de navegación actual de `MainLayout`, chat, pestañas, breadcrumbs y paneles de delegaciones.

## Plan de implementación

- [x] 1. Añadir `react-router-dom` al workspace del cliente con Bun y definir una matriz de compatibilidad de rutas antes de modificar componentes. Incluir rutas directas, recarga, atrás/adelante, rutas legacy y casos con `sessionId` que contiene `/`.
- [ ] 2. Crear `router/routes.tsx` con un único árbol declarativo bajo `BrowserRouter`: rutas públicas de onboarding/login, guardia autenticada, `MainLayout` como layout route y rutas indexadas para las páginas. Usar parámetros y rutas `*` para conservar todos los formatos existentes.
- [ ] 3. Introducir helpers tipados de construcción de URLs y de contexto (`buildContextPath`, `buildSessionPath`, `buildDelegationsPath`). Migrar los consumidores de `useRouter` a `useNavigate`, `useLocation` y esos helpers, eliminando el evento `popstate` sintético.
- [x] 4. Extraer `WorkspaceContextProvider`/`useWorkspaceContext`: resolver el contexto prioritariamente desde los params de URL, hidratar nombres desde el recurso seleccionado o la persistencia existente y centralizar sincronización de `localStorage`. Exponer operaciones genéricas `selectContext` y `clearContext` para eliminar los cuatro handlers duplicados.
- [ ] 5. Extraer `useLaboratoryController` y los modales de laboratorio a un límite propio. Mover fetches, suscripción `experiment_status`, selección de ejecución, acciones de ejecutar/detener/juzgar/exportar/borrar y sus tipos fuera del router.
- [ ] 6. Repartir el renderizado en route elements pequeños: `ChatRoute`, `DelegationsRoute`, `WorkspaceRoute`, `LaboratoryRoute` y rutas administrativas. Cada uno leerá params/contexto y pasará solo las props necesarias a la página final.
- [ ] 7. Adaptar `MainLayout`, `ContextTabBar`, breadcrumbs y el historial interno para derivar la ruta desde `useLocation`; mantener el comportamiento de volver, pero evitar que el historial se alimente de cambios de estado no relacionados con la URL. Reemplazar el alias `/mcps` por un `Navigate` declarativo que preserve la pestaña MCP de Settings.
- [ ] 8. Retirar `hooks/useRouter.ts` cuando no tenga consumidores, eliminar el parseador manual y simplificar `AppRouter` para que solo componga providers, guardia y router.
- [ ] 9. Verificar regresiones con pruebas unitarias del contrato de paths/helpers y pruebas de navegación del router (params, splats, aliases, 404 y back/forward). Ejecutar `bun run typecheck` y `bun run build` en `apps/client`; realizar una comprobación manual de recarga y navegación profunda para proyecto, agente, canal, equipo, laboratorio y pipeline.
- [ ] 10. Actualizar `about.md`, marcar este plan como completado y moverlo a `plans/COMPLETED/` solo tras superar la matriz de compatibilidad y las compilaciones.

## Decisiones de diseño

- Se usará `BrowserRouter`, no rutas hash, porque la aplicación ya expone URLs jerárquicas y el servidor sirve el cliente como SPA.
- La URL será la fuente de verdad para qué vista y contexto están activos; `localStorage` quedará como memoria de conveniencia para nombres y la última selección, nunca como autoridad sobre un parámetro explícito.
- La migración será incremental: primero rutas y adaptadores compatibles, después contextos/controladores, y solo al final se borrará el router manual. Así se pueden validar rutas existentes en cada paso.

## Avance

- 2026-07-19: `react-router-dom` está instalado y `App.tsx` monta un `BrowserRouter`. `useRouter` conserva temporalmente su contrato `route`/`navigate`, pero ya deriva la ruta de `useLocation` y navega con `useNavigate`; se eliminó el evento `popstate` sintético. `bun run typecheck` y `bun run build` del cliente pasan correctamente.
- 2026-07-19: se extrajo `useLaboratoryController`, que concentra el estado, operaciones HTTP y suscripción WebSocket del laboratorio. `AppRouter` solo adapta ese controlador a `MainLayout`, las páginas y los modales; el chequeo de tipos y build del cliente vuelven a pasar.
- 2026-07-19: se extrajo `useWorkspaceContext`, eliminando el estado y los cuatro handlers duplicados de selección de contexto de `AppRouter`. La URL vuelve a sincronizar el contexto activo y `localStorage` conserva la última selección; el chequeo de tipos y build del cliente pasan.
