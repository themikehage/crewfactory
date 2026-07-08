COMPLETED
# Plan: Chat Scroll Experience

Análisis e implementación para ofrecer una experiencia de scroll robusta y profesional en el área de chat.

## Motivación
El scroll de los chats en aplicaciones web a menudo presenta fallas molestas para el usuario:
- Auto-scroll forzado que interrumpe la lectura de mensajes anteriores.
- Brincos toscos o vibraciones debido al uso indiscriminado de `scrollIntoView` durante streaming continuo.
- Desajustes de la posición cuando se cargan elementos tardíos (imágenes, tarjetas de herramientas, layouts expandibles).
- Falta de un indicador claro de que hay mensajes nuevos fuera del viewport actual.

## Propuesta de Solución

1. **Diseño de Hook Reutilizable (`useChatScroll`)**:
   - Monitorear el estado de "pegado abajo" (`isAtBottom`).
   - Usar un `ResizeObserver` en el contenedor del chat para reaccionar a cambios de altura asíncronos y mantener el anclaje si el usuario estaba en el fondo.
   - Proveer un método de scroll al fondo que distinga entre comportamiento suave (smooth) e instantáneo (instant).

2. **Indicador Visual Flotante**:
   - Un botón flotante y minimalista (`ScrollToBottomButton`) que se muestra si:
     - El usuario no está al fondo.
     - Hay nuevos mensajes o streaming activo.
   - El botón contará con un badge o icono animado de "flecha abajo" para inducir la acción del usuario.

3. **Scrollbars Estéticos**:
   - Ajustes de estilo para lograr scrollbars delgados y sutiles que solo aparezcan con el hover del cursor, reduciendo el ruido visual en el chat.

## Archivos Afectados
- `apps/client/src/hooks/useChatScroll.ts` [NEW]
- `apps/client/src/components/chat/ChatArea.tsx` [MODIFY]
- `apps/client/src/index.css` [MODIFY]
- `plans/_index.md` [MODIFY]
- `about.md` [MODIFY]
