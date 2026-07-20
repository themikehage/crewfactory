# Reemplazar `confirm()` nativos con `ConfirmModal`

## Objetivo

Eliminar los 5 `confirm()` / `window.confirm()` nativos del cliente y reemplazarlos con el componente `<ConfirmModal>` reutilizable que ya existe.

## Background

Ya existe `ConfirmModal` en `apps/client/src/components/ui/ConfirmModal.tsx` que wrappea `Modal.tsx`. Se usa en 6 lugares (AgentsPage, MCPMarketplacePage, SkillsPage, WorkspacePanel, LaboratoryModals). El patrón está consolidado y probado.

No se necesitan componentes nuevos.

## Cambios

### 1. `TeamsPage.tsx` — línea 198

```tsx
// Antes
if (window.confirm("Are you sure you want to delete this team?")) {
  await deleteTeam(id);
}

// Después
const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

<ConfirmModal
  open={!!deleteTarget}
  onClose={() => setDeleteTarget(null)}
  onConfirm={async () => {
    if (deleteTarget) await deleteTeam(deleteTarget);
    setDeleteTarget(null);
  }}
  title="Delete Team"
  message="Are you sure you want to delete this team?"
  confirmLabel="Delete"
  destructive
/>
```

Mover el `deleteTeam(id)` a `onConfirm` y abrir el modal en vez del `confirm()`.

### 2. `PipelinesPage.tsx` — línea 65

Mismo patrón. Ya usa `addToast` de `useToast()`, consistente. Agregar estado `deletingId`, renderizar `ConfirmModal`.

### 3. `SessionsKanbanPage.tsx` — líneas 229 y 237

Dos confirms muy cerca: uno individual, otro batch. Agregar dos estados o un estado discriminado (`deleteMode: "single" | "batch" | null`). Usar literals traducidos (los textos están hardcodeados en español).

### 4. `AgentDetailPanel.tsx` — línea 66

Ya usa literals (`l.removeConfirm`). Mover a `ConfirmModal` con `message={l.removeConfirm}` y `confirmLabel={l.remove}` (si existe) o un literal nuevo.

### Resumen de archivos a tocar

| Archivo | Línea | Reemplazo |
|---|---|---|
| `pages/TeamsPage.tsx` | 198 | `window.confirm` → ConfirmModal |
| `pages/PipelinesPage.tsx` | 65 | `confirm` → ConfirmModal |
| `pages/SessionsKanbanPage.tsx` | 229 | `confirm` → ConfirmModal |
| `pages/SessionsKanbanPage.tsx` | 237 | `confirm` → ConfirmModal |
| `components/teams/AgentDetailPanel.tsx` | 66 | `confirm` → ConfirmModal |

## Tamaño estimado

~10-15 líneas nuevas por archivo (import, estado, JSX). Sin componentes nuevos. Sin cambios en shared o server.
