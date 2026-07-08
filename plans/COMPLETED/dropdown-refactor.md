COMPLETED
# Plan: Reusable Dropdown Component

## Objetivo

Reemplazar los 10 `<select>` nativos del cliente por un componente `Dropdown` reutilizable con la misma API de value/onChange, consistente visualmente y accesible.

---

## Infraestructura existente

- `PortalPopover` (`components/chat/PortalPopover.tsx`) — popover flotante con portal, posicionamiento automático (top/bottom), animaciones Framer Motion, click-outside y Escape. Es la base ideal.
- `Button` (`components/ui/Button.tsx`) — botón reutilizable con variantes.
- **No existe** Dropdown, Select ni Combobox reutilizable.

---

## 1. Componentes a crear

### `components/ui/Dropdown.tsx`

Dropdown reutilizable, uncontrolled/controlled, basado en `PortalPopover`.

```tsx
interface DropdownOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface DropdownProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: DropdownOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  label?: string;          // texto opcional arriba del trigger
  className?: string;      // clases extra para el trigger
  matchWidth?: boolean;    // si el popover debe tener el mismo ancho que el trigger
  renderOption?: (option: DropdownOption<T>, selected: boolean) => ReactNode;
  variant?: "solid" | "ghost";  // estilo del trigger
  size?: "xs" | "sm" | "md";
}
```

**Comportamiento:**
- Trigger: botón tipo `ghost` con la opción seleccionada y un chevron animado.
- Popover: `PortalPopover` con lista de opciones clickeables.
- Scroll interno si hay muchas opciones (`max-h-48 overflow-y-auto`).
- Opción activa destacada con color `primary`.
- Keyboard: Enter/Escape, navegación por flechas (nice-to-have inicial, puede ser v2).
- `matchWidth` para que el popover tenga el mismo ancho que el trigger (útil en formularios).

---

## 2. Inventario de migración (10 ocurrencias)

### Grupo A: Role selectors (4 ocurrencias, mismas options)

| # | Archivo | Línea | Propósito | Options |
|---|---------|-------|-----------|---------|
| 1 | `components/channels/AddMemberModal.tsx` | 105 | Role al agregar miembro | lead, senior, member, observer |
| 2 | `components/channels/AgentDetailPanel.tsx` | 230 | Role en panel de detalle | lead, senior, member, observer |
| 3 | `components/channels/ChannelMembersModal.tsx` | 162 | Role por miembro | lead, senior, member, observer |
| 4 | `components/channels/MembersPanel.tsx` | 88 | Reply Mode por miembro | user-only, broadcast, targeted |

**Estrategia:**
- Reemplazar cada `<select>` por `<Dropdown value={...} onChange={...} options={ROLE_OPTIONS}>`.
- Definir constantes compartidas para las opciones (evitar strings duplicados).

### Grupo B: Reply Mode selectors (3 ocurrencias, mismas options)

| # | Archivo | Línea | Propósito | Options |
|---|---------|-------|-----------|---------|
| 5 | `components/channels/AgentDetailPanel.tsx` | 244 | Reply Mode en panel | user-only, broadcast, targeted, mention-only |
| 6 | `components/channels/ChannelMembersModal.tsx` | 147 | Reply Mode por miembro | user-only, broadcast, targeted, mention-only |
| 7 | `components/channels/MembersPanel.tsx` | 88 | Reply Mode por miembro | user-only, broadcast, targeted (falta mention-only) |

**Nota:** `MembersPanel.tsx` no incluye `mention-only`, probablemente por espacio. El nuevo dropdown al ser popover no tiene limitación de espacio, así que se puede unificar.

### Grupo C: Selectores únicos

| # | Archivo | Línea | Propósito | Options |
|---|---------|-------|-----------|---------|
| 8 | `components/laboratory/JudgeReport.tsx` | 83 | Modelo del LLM Judge | Default + dinámicas del API |
| 9 | `pages/LogsConsolePage.tsx` | 482 | Filtro de fuente de logs | all, session, channel |
| 10 | `components/preview/PreviewPanel.tsx` | 432 | Framework selector | Presets de FRAMEWORK_LABELS |
| 11 | `components/settings/GeneralTab.tsx` | 316 | Modo de importación | merge, overwrite |

---

## 3. Constantes compartidas

Crear `apps/client/src/lib/dropdown-options.ts`:

```ts
export const ROLE_OPTIONS = [
  { value: "lead", label: "Lead" },
  { value: "senior", label: "Senior" },
  { value: "member", label: "Member" },
  { value: "observer", label: "Observer" },
] as const;

export const REPLY_MODE_OPTIONS = [
  { value: "user-only", label: "User-only" },
  { value: "broadcast", label: "Broadcast" },
  { value: "targeted", label: "Targeted" },
  { value: "mention-only", label: "Mention-only" },
] as const;

export const LOG_SOURCE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "session", label: "Sessions" },
  { value: "channel", label: "Channels" },
] as const;

export const IMPORT_MODE_OPTIONS = [
  { value: "merge", label: "Merge (Keep current, update matching)" },
  { value: "overwrite", label: "Overwrite (Wipe all data, restore zip)" },
] as const;
```

Las opciones de frameworks y modelos se mantienen dinámicas (vienen del API o de constantes locales).

---

## 4. Orden de implementación

1. **Dropdown.tsx** — Componente base reutilizable.
2. **dropdown-options.ts** — Constantes compartidas.
3. **Grupo A + B** (canales) — 7 ocurrencias, mismas opciones, cambio mecánico.
4. **Grupo C** (selectores únicos) — 4 ocurrencias, requiere verificar cada contexto.
5. **Remover estilos duplicados** — Los `<select>` nativos ya no tendrán sus propias clases Tailwind repetidas.

---

## 5. Consideraciones

- **i18n**: Las opciones de dropdown que muestran texto al usuario deberían usar literales de los `.literals.ts` existentes. Las constantes compartidas pueden ser wrappers que llamen a `literals.roleLead`, etc. Esto aplica sobre todo a canales y roles que ya están en español/inglés.
- **Keyboard a11y**: El `PortalPopover` ya maneja Escape. Para el Dropdown, agregar navegación con flechas (ArrowUp/ArrowDown) es un nice-to-have que se puede diferir a una iteración posterior.
- **MembersPanel.tsx**: Al reemplazar el select nativo por un Dropdown, se puede incluir `mention-only` sin problemas de espacio, unificando con las otras instancias.
- **Styled `<select>` nativo**: No hay problema de accesibilidad inmediato con `<select>` nativo, pero el valor está en consistencia visual (todos los dropdowns se ven iguales) y en la capacidad de extender el componente (iconos, badges, search) sin tocar 10 lugares.
