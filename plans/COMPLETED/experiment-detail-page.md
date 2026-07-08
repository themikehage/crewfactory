COMPLETED
# Plan: Mejora de la Experiencia del Detalle de Experimento y del LLM Judge

## 1. Independización de la Página de Detalle
- Dividir `LaboratoryPage.tsx` en `LaboratoryPage.tsx` (lista y chat de diseño general) y `ExperimentDetailPage.tsx` (pestañas individuales de experimento).
- Agregar ruta dinámica `/laboratory/:experimentId` en `AppRouter.tsx` y `useRouter.ts`.

## 2. Reutilización de MessageList
- Traducir `ChannelMessage[]` and `StreamingAgentState` al formato estándar `Message[]` en `ChannelMessageList.tsx`.
- Modificar `buildGroups` y `AgentTurn` en `MessageList.tsx` para soportar system messages y agrupar por agente específico.

## 3. Persistencia de Ejecuciones
- Guardar cada corrida incrementalmente en `experiments/{experimentId}/runs/{runId}.json`.
- Exponer endpoints `GET /api/experiments/:id/runs` y `GET /api/experiments/:id/runs/:runId`.
- Agregar dropdown de historial en `ExperimentDetailPage` para alternar la visualización del experimento con ejecuciones pasadas.

## 4. Mejoras del LLM Judge y Streaming
- Guardar `activeVariant: "judging"` en el experimento para persistencia de estado durante recargas de página.
- Capturar errores de validación JSON/Zod e inyectar el error y la respuesta cruda en el campo `reasoning`.
- Suscribirse a la sesión del juez y emitir tokens en tiempo real por el evento websocket `judge_streaming`.
- Integrar la visualización del streaming del juez en tiempo real dentro del componente `JudgeReport.tsx`.
