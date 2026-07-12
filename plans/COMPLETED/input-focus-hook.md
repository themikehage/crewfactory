COMPLETED
# Robust Chat Input Focus Hook

Implementar un hook en React para asegurar de manera robusta que el cursor se posicione en el input de texto del chat al entrar a una sesión, cuando el agente termina de responder, o al cargar el chat por primera vez.

## Problema

Anteriormente, al cambiar de sesión o cuando un agente finalizaba la emisión de sus mensajes vía WebSockets, el cursor no volvía al input del chat de forma automática. Esto obligaba al usuario a hacer clic manualmente en la caja de texto para continuar escribiendo, interrumpiendo el flujo natural de la conversación.

## Solución Implementada

1. **Creado Hook `useChatInputFocus`:**
   - Detecta la entrada a sesiones nuevas o vacías, el fin de carga de mensajes (`loadingMessages` pasa a `false`), y el final del streaming del agente (`streaming` pasa a `false`).
   - Usa `requestAnimationFrame` para asegurar que el foco se solicite cuando el elemento esté montado y listo en el DOM.

2. **Propagación del Ref en Componentes de Entrada:**
   - Modificados `WelcomeChatInput` y `ChatInput` para aceptar opcionalmente un `textareaRef` externo.
   - Si no se provee un ref externo, utilizan un ref local (`localTextareaRef`) por compatibilidad hacia atrás en otros contextos.

3. **Integración en `ChatArea.tsx`:**
   - Instanciado el hook y mapeado el ref resultante a todos los componentes de input.

## Archivos Modificados/Creados

- **[NEW]** [useChatInputFocus.ts](file:///c:/Users/themi/AgentWorkspace/crewfactory/apps/client/src/hooks/useChatInputFocus.ts)
- **[MODIFY]** [WelcomeChatInput.tsx](file:///c:/Users/themi/AgentWorkspace/crewfactory/apps/client/src/components/chat/WelcomeChatInput.tsx)
- **[MODIFY]** [ChatInput.tsx](file:///c:/Users/themi/AgentWorkspace/crewfactory/apps/client/src/components/chat/ChatInput.tsx)
- **[MODIFY]** [ChatArea.tsx](file:///c:/Users/themi/AgentWorkspace/crewfactory/apps/client/src/components/chat/ChatArea.tsx)
