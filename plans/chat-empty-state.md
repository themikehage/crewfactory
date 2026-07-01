# Pantalla de Chat Vacia (ChatGPT-Style)

## Motivacion

Cuando una sesion no tiene mensajes, actualmente se ve un placeholder generico
("Send a message to start") en el centro del MessageList. Queremos una pantalla
de bienvenida estilo ChatGPT: input centrado verticalmente, con sugerencias de
uso y el modelo seleccionado visible.

## Estado Actual

En `ChatArea.tsx`:

```
┌─────────────────────────────────────┐
│  header (Connected, model, tools)   │  ← siempre visible
├─────────────────────────────────────┤
│                                     │
│  scroll container (flex-1)          │
│    MessageList                      │
│      ┌───────────────────────┐      │
│      │  Send a message       │      │  ← empty state chico, centrado
│      │  to start             │      │     en el MessageList
│      └───────────────────────┘      │
│                                     │
├─────────────────────────────────────┤
│  ContextMeter                       │  ← se muestra siempre
├─────────────────────────────────────┤
│  InputArea (textarea + send)        │  ← siempre abajo
└─────────────────────────────────────┘
```

## Diseno Propuesto (ChatGPT-Style)

Cuando `messages.length === 0`:

```
┌─────────────────────────────────────┐
│  header (Connected, model, tools)   │  ← igual
├─────────────────────────────────────┤
│                                     │
│              logo/icon              │
│         "What can I help with?"     │
│                                     │
│       ┌─────────────────────┐       │
│       │   Message input...   │       │  ← InputArea centrado
│       └─────────────────────┘       │  verticalmente, flotante
│                                     │
│   [Suggestions / shortcuts chips]   │  ← opcional: prompts de ejemplo
│                                     │
├─────────────────────────────────────┤
│  ContextMeter                       │  ← oculto en empty state
│  No InputArea duplicado abajo       │
└─────────────────────────────────────┘
```

Cuando hay mensajes: layout actual, sin cambios.

## Archivos a Modificar

### 1. `apps/client/src/components/chat/ChatArea.tsx`

Es el componente principal. La logica:

- Si `messages.length === 0 && !streaming` → renderizar `EmptyChatState` en vez
  del scroll container + ContextMeter + InputArea.
- Si hay mensajes → layout actual (scroll > messages > ContextMeter > InputArea).

### 2. `apps/client/src/components/chat/EmptyChatState.tsx` (NUEVO)

Componente con:

- Centrado vertical del contenedor (flex-1 flex items-center justify-center)
- Logo / icono de CrewFactory (mismo favicon que logo.tsx)
- Texto de bienvenida "What can I help with?"
- **InputArea embebido** (reutilizar el mismo componente) pero con ancho
  maximo y estilo "flotante" (bordes redondeados, sombra suave)
- **ModelSelector** incrustado debajo del input (o junto al input)
- **Suggestion chips** (opcional): botones con prompts de ejemplo:
  - "Write a letter..."
  - "Summarize this article"
  - "Explain this code"
  - "Create a plan..."
  - Se agregan via props y se ejecutan via `onSend`

### 3. `apps/client/src/components/chat/InputArea.tsx`

Sin cambios necesarios. Se reutiliza tal cual. El EmptyChatState lo incluye
con sus mismas props pero centrado.

### 4. `apps/client/src/components/chat/ContextMeter.tsx`

Sin cambios. Solo se oculta cuando no hay mensajes.

### 5. `apps/client/src/components/chat/MessageList.tsx`

Se elimina el empty state actual (el `messages.length === 0` check con
"Send a message to start") porque ahora lo maneja EmptyChatState.

## Estructura del EmptyChatState

```
┌──────────────────────────────────────┐
│         flex flex-col h-full         │
│                                      │
│    ┌──────────────────────────────┐  │
│    │    flex-1 flex items-center  │  │  ← centrado vertical
│    │    justify-center            │  │
│    │                              │  │
│    │        ▤ logo/icon           │  │
│    │    "What can I help with?"   │  │  ← text-xl font-display
│    │                              │  │
│    │   ┌──────────────────────┐   │  │
│    │   │  InputArea embed     │   │  │  ← mismo InputArea pero
│    │   │  (textarea + send)   │   │  │     centrado, no abajo
│    │   └──────────────────────┘   │  │
│    │                              │  │
│    │   [Chip] [Chip] [Chip]      │  │  ← suggestion chips (opcional)
│    │                              │  │
│    └──────────────────────────────┘  │
│                                      │
└──────────────────────────────────────┘
```

## Props de EmptyChatState

```typescript
interface EmptyChatStateProps {
  onSend: (message: string) => void;
  streaming: boolean;
  sessionId: string | null;
  activeRepoName: string | null;
  activeAgent: { id: string; name: string } | null;
  activeChannel: { id: string; name: string } | null;
}
```

## Integracion en ChatArea

```tsx
// En ChatArea.tsx, antes del return:
const isEmpty = messages.length === 0 && !streaming;

// En el layout:
if (isEmpty) {
  return (
    <div className="h-full flex flex-row min-w-0 overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 h-full">
        <HeaderRow /> {/* connected badge, sandbox, etc */}
        <EmptyChatState
          onSend={(msg) => handleSend(msg)}
          streaming={streaming}
          sessionId={sessionId}
          activeRepoName={activeRepoName}
          activeAgent={activeAgent}
          activeChannel={activeChannel}
        />
      </div>
    </div>
  );
}
```

## Consideraciones de Diseno

- **InputArea reutilizado**: el mismo componente `InputArea` se usa tanto
  en empty state como abajo en el modo normal. Esto asegura que el
  comportamiento (attach, model selector, tools, skills, mentions) sea
  identico.
- **Sin ContextMeter en empty**: no tiene sentido mostrar contexto si no
  hay mensajes.
- **Sin duplicacion de InputArea**: cuando hay empty state, NO se renderiza
  el InputArea de abajo. Cuando hay mensajes, NO se renderiza el
  EmptyChatState.
- **Animacion**: al enviar el primer mensaje, la transicion de empty a
  layout normal deberia ser instantanea (sin Framer Motion complejo).

## Dependencias

- Ninguna externa. Solo componentes existentes.
- `InputArea` se reutiliza tal cual.
- `ModelSelector` ya esta dentro de InputArea, asi que se hereda.

## Riesgos

- **Overflow**: el centrado vertical debe funcionar en pantallas chicas
  (375px). En mobile, el logo se achica y los chips pueden desaparecer o
  ir a la siguiente linea.
- **Altura del EmptyChatState**: si `InputArea` esta centrado, ocupando
  casi toda la pantalla, la altura del textarea debe ser razonable (2-3
  lines max).
- **Transicion**: pasar de empty a layout normal no debe saltar ni perder
  scroll position.

## Referencias

- ChatGPT landing page (https://chat.openai.com)
- Layout actual en `ChatArea.tsx`
- `InputArea.tsx` - se reutiliza
- `MessageList.tsx` - el empty state actual se elimina
