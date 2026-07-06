COMPLETED ✅ 
# Plan: Reemplazar alert/confirm nativos con Modal reutilizable

## Contexto

Actualmente hay **10 dialogs nativos** del browser (`alert` y `confirm`) dispersos en 8 archivos. El proyecto ya tiene un componente `Modal` reusable (`apps/client/src/components/ui/Modal.tsx`) con animaciones, Escape key, backdrop click, y slots para `title`, `children`, y `footer`.

## Inventario de calls nativos

### `alert()` (5 calls - notificaciones/info)

| # | Archivo | Linea | Mensaje | Tipo |
|---|---------|-------|---------|------|
| 1 | `pages/SkillsPage.tsx` | 41 | `l.resetSuccess` | Success |
| 2 | `pages/SkillsPage.tsx` | 43 | `l.resetErrorPrefix + err.message` | Error |
| 3 | `pages/DashboardPage.tsx` | 91 | `err.message` (rename fail) | Error |
| 4 | `pages/DashboardPage.tsx` | 118 | `err.message` (delete fail) | Error |
| 5 | `components/chat/tools/AskQuestionForm.tsx` | 68 | Validacion hardcoded | Warning |

### `confirm()` (5 calls - confirmaciones destructivas)

| # | Archivo | Linea | Mensaje |
|---|---------|-------|---------|
| 1 | `components/layout/AppRouter.tsx` | 139 | Delete experimento |
| 2 | `pages/SkillsPage.tsx` | 28 | Reset skills (`l.resetConfirm`) |
| 3 | `components/workspace/WorkspacePanel.tsx` | 263 | Delete file/folder |
| 4 | `pages/MCPMarketplacePage.tsx` | 190 | Uninstall MCP server |
| 5 | `pages/AgentsPage.tsx` | 70 | Delete agent (`l.deleteConfirm_1 + name + l.deleteConfirm_2`) |

## Estrategia

### Para `confirm()` -> `ConfirmModal`
Crear un componente `ConfirmModal` que envuelva el `Modal` existente. Patron: abrir modal, esperar respuesta del usuario (callback `onConfirm`/`onCancel`), ejecutar accion.

### Para `alert()` -> Toast notifications
Los `alert()` son mensajes no-bloqueantes (success, error, validacion). Reemplazar con un sistema de toasts global. `MCPMarketplacePage` ya tiene un sistema local de toasts - globalizarlo.

## Tareas

### Tarea 1: Crear `ConfirmModal` component
- **Archivo**: `apps/client/src/components/ui/ConfirmModal.tsx`
- Props: `open`, `onClose`, `onConfirm`, `title`, `message`, `confirmLabel?`, `cancelLabel?`, `destructive?`
- Usa el `Modal` existente como base
- Boton confirm rojo si `destructive=true`, verde/primary si no
- Soporte para literales i18n

### Tarea 2: Crear sistema global de Toasts
- **Archivo**: `apps/client/src/components/ui/Toast.tsx`
- **Archivo**: `apps/client/src/lib/useToast.ts` (hook)
- Tipos: `success`, `error`, `info`, `warning`
- Auto-dismiss (3s success/info, 5s error)
- Provider en el root del app
- Hook `useToast()` que retorna `addToast(type, message)`

### Tarea 3: Reemplazar `confirm()` en los 5 archivos

| Archivo | Cambio |
|---------|--------|
| `AppRouter.tsx:139` | Estado `deleteExpConfirm` + `ConfirmModal` destructivo |
| `SkillsPage.tsx:28` | Estado `showResetConfirm` + `ConfirmModal` destructivo |
| `WorkspacePanel.tsx:263` | Estado `deleteConfirm` + `ConfirmModal` destructivo |
| `MCPMarketplacePage.tsx:190` | Estado `deleteServerConfirm` + `ConfirmModal` destructivo |
| `AgentsPage.tsx:70` | Estado `showDeleteConfirm` + `ConfirmModal` destructivo |

### Tarea 4: Reemplazar `alert()` en los 3 archivos

| Archivo | Cambio |
|---------|--------|
| `SkillsPage.tsx:41,43` | `addToast("success", ...)` y `addToast("error", ...)` |
| `DashboardPage.tsx:91,118` | `addToast("error", err.message)` en ambos catch |
| `AskQuestionForm.tsx:68` | `addToast("warning", ...)` o inline error state |

### Tarea 5: Migrar toasts locales de MCPMarketplacePage
- Reemplazar el sistema local de toasts de `MCPMarketplacePage` por el hook global `useToast()`
- Eliminar estado y markup local de toasts

### Tarea 6: Wire up ToastProvider en el root
- Agregar `<ToastProvider>` en el componente root de la app (probablemente `App.tsx` o similar)

### Tarea 7: Literales i18n
- Agregar literales para `ConfirmModal` defaults (confirm, cancel, areYouSure)
- Agregar literal para el mensaje de validacion de `AskQuestionForm`
- Mover todos los strings hardcoded a `.literals.ts`

## Orden de ejecucion

```
Tarea 1 (ConfirmModal) ──┐
                          ├──> Tarea 3 (reemplazar confirms)
Tarea 2 (Toast system) ──┤
Tarea 6 (ToastProvider) ─┤
                          ├──> Tarea 4 (reemplazar alerts)
                          └──> Tarea 5 (migrar toasts MCP)
                                 │
                                 v
                            Tarea 7 (literales)
                                 │
                                 v
                            Validar build + lint
```

## Consideraciones

- El patron `confirm()` es bloqueante (sincronico). El reemplazo requiere refactor a estado async: guardar la accion pendiente, mostrar modal, ejecutar callback en `onConfirm`.
- `AskQuestionForm.tsx` tiene el string hardcoded en espanol - mover a literales.
- `WorkspacePanel.tsx` tiene el mensaje en ingles - unificar con literales.
- Verificar que `Modal` existente soporta el caso de uso de confirmacion (botones footer).
