COMPLETED ✅
# ChannelOrgChart Redesign — Clean & Professional UI

Rediseño completo del componente `ChannelOrgChart.tsx` para alinearlo con la calidad visual del resto de la app.

---

## 1. Diagnóstico — Problemas Actuales

### 1.1 Estructura y Código

| Problema | Detalle |
|---|---|
| CSS duplicada en `if/else` | Cada rol redefine `cardClass`, `badgeClass`, `sideLine` en un bloque condicional monolítico. Frágil y difícil de extender. |
| Dimensiones fijas del canvas | `width = 800`, `nodeWidth = 180`, `levelHeight = 140` hardcodeados. Si hay 10 miembros en un nivel, los nodos colisionan. |
| Posicionamiento manual | `left`/`top` calculados con inline styles. Sin auto-layout ni adaptación a container width. |
| SVG path inline en JSX | Lógica de líneas de conexión (tramos verticales, horizontales, bifurcaciones) embebida directamente — difícil de leer y mantener. |
| Hover overlay frágil | `absolute inset-0 bg-surface/98` sobre la card con z-index manual. Causa flickering en casos borde. |
| `isMobile` state | Estado duplicado (ya existe CSS media query). El resize listener es innecesario — se puede resolver con CSS puro o `useMediaQuery`. |

### 1.2 Visual

| Problema | Detalle |
|---|---|
| Colores raw | `#a855f7` (purple) en vez de tokens Tailwind. El sistema usa `accent` = `#4ade80` (green). El purple no pertenece al design system. |
| Sin animaciones | Framer Motion está disponible pero no se usa. Las cards entran sin transición, hover es solo opacidad. |
| Sin headers de nivel | Desktop no muestra "Leads (2)", "Seniors (3)" sobre cada nivel. El usuario no sabe cuál es cuál. |
| Mobile desprolijo | Vista mobile es una lista plana agrupada, sin diseño jerárquico que comunique la estructura. |
| Badge de replyMode | Muestra `Mode: broadcast` sin contexto. No es intuitivo qué significa cada modo para un usuario no técnico. |
| Empty state genérico | El mensaje "Add agents to this channel..." no guía al usuario sobre cómo hacerlo. |
| Tipografía inconstante | `text-[8px]`, `text-[9px]`, `text-[10px]`, `text-xs` mezclados sin jerarquía clara. |

### 1.3 Arquitectura

| Problema | Detalle |
|---|---|
| `renderCardContent` acoplado | La función recibe `m`, `info`, `name`, `role` pero extrae el role de `m.role` internamente. Parámetros redundantes. |
| Sin separación de concerns | El SVG de conexiones, el layout de nodos, y el render de cards están en un solo componente de 237 líneas. |
| Roles hardcodeados | `lead`, `senior`, `member`, `observer` como strings mágicos. Si se agrega un nuevo rol, hay que tocar 4 lugares. |

---

## 2. Diseño Propuesto

### 2.1 Arquitectura de Componentes

```
ChannelOrgChart/
  ChannelOrgChart.tsx         # Contenedor: recibe miembros, calcula layout, renderiza SVG + nodos
  OrgChartConnectionLines.tsx # SVG puro: líneas jerárquicas entre niveles
  OrgChartLevel.tsx           # Fila de un nivel: header + nodos distribuidos
  OrgChartCard.tsx            # Nodo individual: nombre, rol, skills, hover tooltip
  OrgChartEmpty.tsx           # Estado vacío con CTA
```

### 2.2 Role Config — Single Source of Truth

```typescript
const ROLE_CONFIG: Record<TeamRole, {
  label: string;
  order: number;           // Orden en el organigrama (0 = top)
  accentClass: string;     // Clase Tailwind para el acento del rol
  badgeClass: string;      // Clase para el badge de rol
  borderClass: string;     // Clase para el borde de la card
  shadowClass: string;     // Clase para la sombra (lead/senior)
  dashPattern: string;     // SVG dasharray para líneas de conexión (observer = dashed)
  opacity: string;         // Opacidad base (observer = reducido)
}> = {
  lead: {
    label: "Lead", order: 0,
    accentClass: "border-l-accent bg-accent/5",
    badgeClass: "bg-accent/10 text-accent border-accent/20",
    borderClass: "border-accent/30",
    shadowClass: "shadow-lg shadow-accent/5",
    dashPattern: "none",
    opacity: "opacity-100",
  },
  senior: {
    label: "Senior", order: 1,
    accentClass: "border-l-accent/60 bg-accent/[0.03]",
    badgeClass: "bg-accent/10 text-accent/80 border-accent/15",
    borderClass: "border-accent/20",
    shadowClass: "shadow-md shadow-accent/[0.03]",
    dashPattern: "none",
    opacity: "opacity-100",
  },
  member: {
    label: "Member", order: 2,
    accentClass: "border-l-surface-hover",
    badgeClass: "bg-surface-hover text-text-secondary border-surface-hover",
    borderClass: "border-surface-hover",
    shadowClass: "",
    dashPattern: "none",
    opacity: "opacity-100",
  },
  observer: {
    label: "Observer", order: 3,
    accentClass: "border-l-transparent",
    badgeClass: "bg-bg text-text-secondary/50 border-surface-hover/50",
    borderClass: "border-dashed border-surface-hover/50",
    shadowClass: "",
    dashPattern: "3 3",
    opacity: "opacity-60 hover:opacity-100",
  },
};
```

Esto elimina todos los `if/else` del render. Solo se indexa por `m.role`.

### 2.3 Canvas Responsivo

```typescript
// En vez de width=800 hardcodeado, calcular según container + miembros
const useCanvasDimensions = (containerRef, levels) => {
  const containerWidth = containerRef.current?.clientWidth ?? 800;
  const maxMembersInLevel = Math.max(...levels.map(l => l.list.length), 1);
  const nodeWidth = Math.min(200, (containerWidth - 80) / maxMembersInLevel - 16);
  const nodeHeight = 80;
  const levelHeight = 150;
  const totalWidth = Math.max(containerWidth, maxMembersInLevel * (nodeWidth + 16));
  const totalHeight = levels.length * levelHeight + 60;
  return { nodeWidth, nodeHeight, levelHeight, totalWidth, totalHeight };
};
```

Esto evita overlap cuando hay muchos miembros y escala bien en pantallas grandes.

### 2.4 Animaciones (Framer Motion)

- **Entrada de cards**: `motion.div` con `initial={{ opacity: 0, y: 8 }}` y `animate={{ opacity: 1, y: 0 }}`, stagger por nivel
- **Hover**: `whileHover={{ scale: 1.02, y: -2 }}` con transición `spring`
- **Transición de rol**: `layoutId` en las cards para que al cambiar de rol se animen suavemente
- **Líneas SVG**: `animate={{ pathLength: 1 }}` con `initial={{ pathLength: 0 }}` para draw-in effect

### 2.5 Tooltips en vez de Overlay

El hover overlay actual (que cubre toda la card) se reemplaza por un tooltip posicionado:

```tsx
// Tooltip que aparece arriba/abajo de la card al hacer hover
<div className="absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full 
  bg-surface border border-surface-hover rounded-lg p-2 shadow-xl 
  text-[10px] text-text-secondary w-48 z-50">
  <p className="font-semibold text-text-primary">{name}</p>
  <p className="mt-1">Skills: {skills.join(", ")}</p>
  <p className="mt-0.5">Reply: {replyMode}</p>
</div>
```

### 2.6 Level Headers

Cada nivel muestra un header con el nombre del rol y el conteo:

```
┌─ Leads (2) ──────────────────────────────────────────┐
│  [Card]                    [Card]                     │
└───────────────────────────────────────────────────────┘
         │              │              │
┌─ Seniors (3) ────────────────────────────────────────┐
│  [Card]        [Card]        [Card]                   │
└───────────────────────────────────────────────────────┘
```

### 2.7 Mobile View Mejorada

En vez de una lista plana, usar un tree view colapsable con indentación:

```
▼ Leads (2)
  ┌──────────────────────────┐
  │ @tech-lead    [LEAD]     │
  │ Senior Architect         │
  └──────────────────────────┘
  ┌──────────────────────────┐
  │ @pm-lead      [LEAD]     │
  │ Product Manager          │
  └──────────────────────────┘
▶ Seniors (3)
▶ Members (4)
```

Cada card mantiene el mismo diseño que desktop pero en formato lista con indentación por nivel.

### 2.8 ReplyMode Visual

En vez de mostrar `Mode: broadcast` como texto crudo, usar iconos + tooltip:

| Mode | Icono | Tooltip |
|---|---|---|
| `broadcast` | 📡 | "Responde a todos los mensajes del canal" |
| `targeted` | 🎯 | "Solo responde cuando es mencionado directamente" |
| `user-only` | 👤 | "Solo responde a mensajes del usuario" |
| `mention-only` | @ | "Solo responde cuando es @mencionado" |

---

## 3. Plan de Implementación

### Fase 1: Refactor Interno (sin cambiar visual)
1. Extraer `ROLE_CONFIG` y reemplazar los `if/else` en `renderCardContent`
2. Separar `OrgChartConnectionLines.tsx` con la lógica SVG
3. Separar `OrgChartCard.tsx` con la lógica del nodo
4. Usar `useRef` + `ResizeObserver` para dimensiones responsivas (reemplazar `isMobile` state)

### Fase 2: Mejoras Visuales
5. Agregar level headers con nombre de rol y conteo
6. Reemplazar hover overlay por tooltip posicionado
7. Agregar indicator visual de replyMode (icono + tooltip)
8. Unificar tipografía con jerarquía clara
9. Reemplazar purple (`#a855f7`) con tokens de Tailwind

### Fase 3: Animaciones y Polish
10. Agregar Framer Motion a cards (stagger entry, hover scale)
11. Agregar draw-in animation a líneas SVG
12. Mejorar mobile view con tree indentado
13. Rediseñar empty state con CTA de "Add Agent"

---

## 4. Archivos Afectados

| Archivo | Cambio |
|---|---|
| `apps/client/src/components/channels/ChannelOrgChart.tsx` | Refactor principal — ~70% rewrite |
| `apps/client/src/components/channels/OrgChartCard.tsx` | **NUEVO** — nodo individual extraído |
| `apps/client/src/components/channels/OrgChartLines.tsx` | **NUEVO** — SVG connection lines |
| `apps/client/src/components/channels/OrgChartLevel.tsx` | **NUEVO** — nivel con header + cards |
| `apps/client/src/components/channels/OrgChartEmpty.tsx` | **NUEVO** — empty state |
| `apps/client/src/components/channels/ChannelChatArea.tsx` | Sin cambios (imports se mantienen, ChannelOrgChart mantiene misma interfaz) |

---

## 5. No Cambiar

- Props del componente (`members: ChannelMember[]`, `registeredAgents: AgentInfo[]`) — interfaz pública se mantiene
- Punto de uso en `ChannelChatArea.tsx` — no requiere cambios
- La lógica de agrupación por roles (`leads`, `seniors`, `regulars`, `observers`) — se preserva

---

## 6. Prioridad

**Media-Alta**. El componente funciona pero se ve amateur comparado con el resto de la UI (chat, laboratory, sidebar). La mejora visual es significativa con relativamente poco esfuerzo (~400 líneas net new, ~150 líneas deleted).
