# Channels → Teams + Jerarquía + Organigrama

Renombrar "Channels" a "Teams" en la UI, introducir roles jerárquicos entre miembros, y añadir una vista de organigrama alternativa.

---

## 1. Motivación

Hoy "Channel" es un concepto plano: todos los miembros son iguales, solo se diferencian por su `replyMode`. La metáfora de "Team" refuerza la idea de un grupo unido que resuelve problemas concretos de forma sistemática. En los equipos reales hay jerarquía —líderes, miembros seniors, juniors, especialistas— y eso debería reflejarse en la herramienta.

Además, una vista de organigrama permite entender de un vistazo quién lidera, quién ejecuta, y cómo se relacionan los agentes, algo que la vista plana de lista no comunica.

---

## 2. Renombre en UI (Capa Superficial)

Solo se cambian textos visibles al usuario. Los identifiers internos (tipos TypeScript, nombres de componentes, rutas API, eventos WS, claves localStorage) **se mantienen como `channel`** para evitar refactors masivos que no aportan valor.

### Textos a cambiar

| Texto actual | Nuevo texto | Archivos afectados |
|---|---|---|
| "Channels" | "Teams" | ChannelsPage, MainLayout (breadcrumb, nav) |
| "Channel" | "Team" | Modales, títulos, descripciones |
| "Create Channel" | "Create Team" | ChannelsPage, CreateChannelModal |
| "No channels created" | "No teams created" | ChannelsPage |
| "Canal" | "Team" / "Equipo" | ChannelSettingsModal, ChannelMembersModal (Spanish text) |
| "Configuración del Canal" | "Configuración del Team" | ChannelSettingsModal |
| "channel" (en inglés) | "team" | ChannelMessages, ChannelMessageList, AddMemberModal |
| "Multi-agent group channels..." | "Multi-agent teams..." | ChannelsPage subtitle |
| "Gestionar miembros del canal" | "Gestionar miembros del team" | ChannelCard |
| "#" (icono) | "#" (se mantiene) o icono de Team | ChannelCard, headers |
| "Send message to channel..." | "Send message to team..." | ChannelInput |
| "Miembros de #name" | "Miembros de #name" (se mantiene) | ChannelMembersModal |
| "Ajustes del canal" | "Ajustes del team" | ChannelChatArea |
| "Contexto (n)" (en canal) | "Contexto (n)" (se mantiene) | ChannelChatArea |

### Alcance exacto: ~35 UI strings en ~15 archivos

Estrategia:
- Navegación, títulos de página y botones principales cambian a "Teams"
- Texto dentro de componentes de canal se cambia a "team"
- Texto en español ("canal") se cambia a "team" (manteniendo español)
- Los valores internos (`replyMode` enum, nombres de archivo, rutas) **no se tocan**

---

## 3. Roles Jerárquicos en Teams

### 3.1 Esquema Actual

```typescript
ChannelMember = {
  agentId: string;
  replyMode: ReplyMode;        // "user-only" | "broadcast" | "targeted" | "mention-only"
  targetAgentIds?: string[];
};
```

Plano: todos los miembros están al mismo nivel.

### 3.2 Esquema Propuesto

```typescript
TeamMember = {
  agentId: string;
  replyMode: ReplyMode;
  targetAgentIds?: string[];
  role: TeamRole;              // ← NUEVO
};

TeamRole = "lead" | "senior" | "member" | "observer";
```

| Role | Significado | Visual |
|------|-------------|--------|
| `lead` | Líder del equipo. Responde a todo, puede delegar/reasignar. | Corona/estrella, arriba en organigrama |
| `senior` | Miembro experimentado. Responde a mensajes del lead y usuarios. | Medalla, nivel medio-alto |
| `member` | Miembro regular. Responde según su replyMode. | Círculo, nivel medio |
| `observer` | Solo lee, no participa activamente. | Círculo punteado/translúcido |

No se añade lógica de enrutamiento nueva en el backend —el `role` es puramente informativo para la UI y el organigrama. El `replyMode` sigue controlando quién recibe qué mensajes.

### 3.3 Impacto en la UI

- **TeamMemberModal**: Dropdown "Role" junto al "Reply Mode" existente
- **TeamCard**: Muestra el role del lead o "N members" con indicador de jerarquía
- **TeamChatArea header**: Muestra "Lead: @agentName" bajo el nombre del equipo
- **MembersPanel**: Lista agrupada por role (Lead → Senior → Member → Observer)

### 3.4 Esquema en ChannelStore

```typescript
// Se añade role opcional (backward compatible)
interface ChannelMember {
  agentId: string;
  replyMode: ReplyMode;
  targetAgentIds?: string[];
  role?: TeamRole;       // default: "member"
}
```

---

## 4. Vista de Organigrama

### 4.1 Alternancia de Vista

El TeamChatArea (o ChannelsPage) tiene un toggle:

```
[ 📋 List View | 🏢 Org Chart ]
```

Por defecto: List View (la actual). El usuario puede cambiar a Org Chart.

### 4.2 Diseño del Organigrama

```
                    ┌──────────────┐
                    │   @tech-lead │
                    │     (lead)   │
                    └──────┬───────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
   ┌──────▼───────┐ ┌─────▼──────┐ ┌──────▼───────┐
   │ @senior-dev  │ │@frontend-dev│ │ @qa-eng      │
   │   (senior)   │ │  (member)   │ │  (observer)  │
   └──────────────┘ └─────────────┘ └──────────────┘
```

**Reglas de layout:**
- `lead` arriba, centrado
- `senior` en nivel medio, debajo del lead
- `member` en nivel inferior
- `observer` al costado o abajo, con opacidad reducida
- Flechas/conexiones jerárquicas entre niveles
- Cada nodo muestra: avatar (inicial), nombre, role badge

### 4.3 Componentes

```typescript
// TeamOrgChart.tsx — contenedor del SVG/HTML del organigrama
// TeamOrgNode.tsx — nodo individual (avatar + nombre + badge de role)

interface TeamOrgChartProps {
  members: ChannelMember[];
  agentNames: Record<string, string>;  // agentId → display name
}
```

**Estrategia de renderizado:** SVG nativo (sin librería externa) para el árbol de nodos y líneas de conexión. Cada nodo es un `<g>` con `<rect>` + `<text>`. Las líneas son `<path>` o `<line>`.

**Responsive:** 
- Desktop: árbol horizontal/vertical completo
- Mobile (≤768px): lista colapsable por nivel, expandible al tocar

### 4.4 Interacción

- **Hover** sobre un nodo: tooltip con replyMode + skills del agente
- **Click** en un nodo: abre modal de detalle del miembro (cambiar role, replyMode, remover)
- **Drag & drop** (opcional v2): reordenar jerarquía arrastrando nodos

---

## 5. Orden de Implementación

1. **Fase 1: UI rename** — Cambiar strings visibles de "Channel/s" a "Team/s" en español/inglés (~15 archivos, ~35 strings)
2. **Fase 2: Roles** — Añadir `TeamRole` schema, extender `ChannelMember` con `role`, actualizar modales con selector de role
3. **Fase 3: Org Chart** — Componente `TeamOrgChart.tsx` con SVG, toggle vista, responsive mobile
4. **Fase 4: Polish** — Transiciones animadas entre vistas, drag & drop (opcional)

---

## 6. Archivos a Modificar

### Fase 1 — UI strings (~35 cambios en ~15 archivos)

```
apps/client/src/pages/ChannelsPage.tsx
apps/client/src/pages/ChannelDetailPage.tsx
apps/client/src/components/channels/ChannelCard.tsx
apps/client/src/components/channels/ChannelMembersModal.tsx
apps/client/src/components/channels/ChannelContextModal.tsx
apps/client/src/components/channels/ChannelSettingsModal.tsx
apps/client/src/components/channels/AddMemberModal.tsx
apps/client/src/components/channels/ChannelMessages.tsx
apps/client/src/components/channels/ChannelMessageList.tsx
apps/client/src/components/channels/ChannelInput.tsx
apps/client/src/components/channels/ChannelChatArea.tsx
apps/client/src/components/channels/MembersPanel.tsx
apps/client/src/components/layout/MainLayout.tsx
apps/client/src/components/sidebar/SessionSidebar.tsx
```

### Fase 2 — Roles (schemas + UI)

```
packages/shared/src/schemas.ts          # Añadir TeamRoleSchema
apps/client/src/components/channels/
  ChannelMembersModal.tsx               # Selector de role
  AddMemberModal.tsx                    # Selector de role en add
  MembersPanel.tsx                      # Agrupación por role
  ChannelCard.tsx                       # Badge de role del lead
  ChannelChatArea.tsx                   # "Lead: @agent" en header
```

### Fase 3 — Organigrama (nuevos + modificados)

```
apps/client/src/components/channels/
  TeamOrgChart.tsx                      # NUEVO — SVG org chart
  TeamOrgNode.tsx                       # NUEVO — Nodo individual
  ChannelChatArea.tsx                   # Toggle vista
  ChannelDetailPage.tsx                 # Toggle vista (si aplica)
```

---

## 7. NO Cambiar (Internal API)

| Categoría | Ejemplos |
|---|---|
| Tipos TypeScript | `Channel`, `ChannelMember`, `ChannelMessage`, `ChannelStore`, `ChannelOrchestrator` |
| Rutas API | `/api/channels/*` |
| Eventos WS | `channel_join`, `channel_send`, `channel_message`, `channel_agent_token` |
| Claves localStorage | `"active-channel"` |
| Archivos server | `channel-store.ts`, `channel-orchestrator.ts`, `channels/index.ts` |
| Enums replyMode | `"user-only"`, `"broadcast"`, `"targeted"`, `"mention-only"` |
| Nombres de componentes | `ChannelCard`, `ChannelMembersModal`, `ChannelsPage` |
| Nombres de hooks | `useChannel()`, `useChannels()` |

La capa interna sigue siendo `channel`. La UI muestra `Team`. Esto mantiene el refactor acotado y evita riesgos.
