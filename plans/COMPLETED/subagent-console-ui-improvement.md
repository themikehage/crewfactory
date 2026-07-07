# SubagentConsole UI Improvement

Mejorar la UI de `SubagentConsole.tsx` reutilizando los componentes de renderizado de `MessageList.tsx`.

## Problema Actual

`SubagentConsole` muestra los mensajes del subagente en un formato tipo terminal:
- Thinking blocks: texto itálico inline sin colapsar
- Text output: `RichMarkdown` plano, sin soporte de file markers (imágenes, HTML, PDF, etcétera)
- User messages: línea gris con prefijo `>` sin estilo de burbuja
- Sin botón de copia, sin avatar, sin animaciones por mensaje

`MessageList.tsx` ya tiene componentes pulidos para todo esto.

## Análisis de Reutilización

### Componentes a extraer (de MessageList.tsx a shared)

| Componente | Líneas | Dependencias |
|---|---|---|
| `ThinkingBlock` | 105-128 | framer-motion no, solo useState |
| `AssistantTextBlock` | 156-320 | `RichMarkdown`, `HtmlPreview`, `ImageGrid`, `ToolResultInspector` (resolveFileUrl, extractFileMarkers, isHtml, HtmlFileFetcher, getFileType) |

Ambos están definidos como funciones locales en `MessageList.tsx` — no exportados.

### Dependencias de AssistantTextBlock

```
resolveFileUrl   → ToolResultInspector.tsx
extractFileMarkers → ToolResultInspector.tsx
isHtml           → ToolResultInspector.tsx
HtmlFileFetcher  → ToolResultInspector.tsx
getFileType      → ToolResultInspector.tsx
HtmlPreview      → ./HtmlPreview
ImageGrid        → ./ImageGrid
RichMarkdown     → ./RichMarkdown
```

Requiere props: `sessionId`, `activeProjectName`, `activeAgentId`, `activeChannelId`.

## Plan de Implementación

### Paso 1: Extraer ThinkingBlock y AssistantTextBlock

Crear `apps/client/src/components/chat/MessageBlocks.tsx`:

```tsx
// ThinkingBlock — collapsible reasoning (extraído de MessageList.tsx)
// AssistantTextBlock — rich text + file markers + copy button (extraído de MessageList.tsx)
```

Mantener firmas de props idénticas. Re-exportar desde `MessageList.tsx` (o importar desde el nuevo archivo).

### Paso 2: Actualizar MessageList.tsx

Importar `ThinkingBlock` y `AssistantTextBlock` desde `./MessageBlocks` en lugar de definirlos localmente.

### Paso 3: Agregar nuevas props a SubagentConsole

```tsx
interface Props {
  parentId: string;
  toolCallId: string;
  task: string;
  subagentRole?: string;
  onClose: () => void;
  // Nuevas props:
  sessionId: string | null;
  activeProjectName?: string | null;
  activeAgentId?: string | null;
  activeAgentName?: string | null;
  activeAgentAvatarUrl?: string | null;
  activeChannelId?: string | null;
}
```

### Paso 4: Actualizar SubagentConsole.tsx

- Reemplazar renderizado inline de thinking con `<ThinkingBlock thinking={thinkingText} />`
- Reemplazar `<RichMarkdown content={outputText} />` con `<AssistantTextBlock text={outputText} ... />`
- User messages: cambiar a estilo burbuja con borde izquierdo o badge de "User"
- Agregar `<AgentAvatar>` para mensajes del agente
- Agregar `motion.div` con fade-in por mensaje
- Asegurar que auto-scroll al final sigue funcionando

### Paso 5: Actualizar ChatArea.tsx

Pasar las props adicionales al `SubagentConsole`:

```tsx
<SubagentConsole
  parentId={sessionId}
  toolCallId={subagentDrawer.toolCallId}
  task={subagentDrawer.task}
  subagentRole={subagentDrawer.role}
  onClose={() => setSubagentDrawer(null)}
  sessionId={sessionId}
  activeProjectName={activeProjectName}
  activeAgentId={activeAgent?.id}
  activeAgentName={activeAgent?.name}
  activeAgentAvatarUrl={activeAgent?.avatarUrl}
  activeChannelId={activeChannel?.id}
/>
```

## No tocar

- La lógica de WebSocket / eventos
- La obtención de histórico (fetchHistory)
- El timeline de steps (tool calls ledger)
- El status badge
- El botón abort
- El header y layout general del panel lateral
