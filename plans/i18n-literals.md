# Plan: Sistema de Traduccion con Archivos `.literals` por Vista

## Estado Actual

El frontend tiene 69 archivos `.tsx` en `apps/client/src/` con un mezclum inconsistente de literales en ingles y espanol:

| Vista | Idioma |
|-------|--------|
| LoginPage | EN (Sign In, Username, Password) |
| DashboardPage (Proyectos) | ES (Proyectos, Cargando, Nuevo Proyecto, Abrir, Renombrar) |
| AgentsPage | Mixto (botones EN, "Eliminar"/"Eliminando" ES) |
| ChannelsPage | Mixto (modal "Create Channel" EN, labels ES) |
| SettingsPage | EN (LLM Providers, Env Variables, Integrations) |
| LaboratoryPage | ES (Estado de Corrida, Conversacion del Experimento) |
| SkillsPage | Mixto ("Error Loading Skills" EN, "Skills restablecidas" ES) |
| LogsConsolePage | Mixto (ES labels, EN technical strings) |
| SessionSidebar | Mixto (Laboratorio + Skills Library + Settings + Consola de Logs) |
| MainLayout breadcrumbs | Mixto (Proyectos/Agentes/Canales + Files/Preview/Settings) |
| Channel* components | ES dominante (Configuracion, Miembros, Benchmark, Optimizacion) |
| Chat* components | EN (InputArea, MessageList) |
| PreviewPanel | EN (Auto-detect, Build Now, framework names) |
| Workspace* | EN (Workspace, New Folder, Save) |

No existe ningun sistema de i18n hoy.

## Arquitectura Propuesta

### Core

```
apps/client/src/
  lib/
    LiteralsContext.tsx     # Context + Provider locale
    useLiterals.ts          # Hook generico <T>(literals: T) => T[locale]
    types.ts                # Tipo generico LiteralsRecord<T>
  <cada-pagina-o-componente>/
    {ViewName}.literals.ts  # Traducciones colocalizadas
```

### Flujo

1. `LiteralsProvider` en `App.tsx` detecta locale del browser (`navigator.language`) y lo persiste en localStorage.
2. Cada vista importa su archivo `.literals.ts` y llama `useLiterals(literals)`.
3. `useLiterals` devuelve el mapa de strings para el locale activo, tipado.
4. Cuando el usuario cambia idioma, se actualiza el context y todos los hooks re-renderizan.

### Diseno del Archivo `.literals.ts`

```ts
// LoginPage.literals.ts
import type { LiteralsRecord } from "@/lib/types";

export const literals = {
  en: {
    title: "CrewFactory",
    subtitle: "Multi-agent orchestration platform",
    usernamePlaceholder: "Username",
    passwordPlaceholder: "Password",
    signIn: "Sign In",
    signingIn: "Signing in...",
    loginFailed: "Login failed",
  },
  es: {
    title: "CrewFactory",
    subtitle: "Plataforma de orquestacion multi-agente",
    usernamePlaceholder: "Usuario",
    passwordPlaceholder: "Contrasena",
    signIn: "Iniciar Sesion",
    signingIn: "Iniciando sesion...",
    loginFailed: "Error al iniciar sesion",
  },
} satisfies LiteralsRecord;

export type LoginLiterals = typeof literals;
```

### Uso en Componentes

```tsx
import { useLiterals } from "@/lib/useLiterals";
import { literals } from "./LoginPage.literals";

function LoginPage() {
  const l = useLiterals(literals);
  return <h1>{l.title}</h1>;
}
```

### Locale por Omision vs Switch

- Deteccion automatica: `navigator.language.startsWith("es")` → es, sino en.
- Persistencia en localStorage key `locale`.
- Selector de idioma en SettingsPage (GeneralTab) y/o header.

## Fases de Implementacion

### Fase 0: Infraestructura Base

**Archivos a crear:**
- `apps/client/src/lib/types.ts` — tipo `LiteralsRecord`
- `apps/client/src/lib/LiteralsContext.tsx` — context + provider con locale state
- `apps/client/src/lib/useLiterals.ts` — hook tipado
- `apps/client/src/components/settings/LocaleSelector.tsx` — toggle EN/ES

**Archivos a modificar:**
- `apps/client/src/App.tsx` — wrappear en `LiteralsProvider`
- `apps/client/src/components/settings/GeneralTab.tsx` — agregar `LocaleSelector`

### Fase 1: Pages (9 vistas)

| Archivo .literals | Componente |
|---|---|
| `LoginPage.literals.ts` | LoginPage |
| `DashboardPage.literals.ts` | DashboardPage |
| `AgentsPage.literals.ts` | AgentsPage |
| `ChannelsPage.literals.ts` | ChannelsPage + CreateChannelModal |
| `SettingsPage.literals.ts` | SettingsPage |
| `SkillsPage.literals.ts` | SkillsPage |
| `LogsConsolePage.literals.ts` | LogsConsolePage |
| `LaboratoryPage.literals.ts` | LaboratoryPage |
| `ChannelDetailPage.literals.ts` | ChannelDetailPage |

### Fase 2: Layout & Sidebar (3 vistas)

| Archivo .literals | Componente |
|---|---|
| `MainLayout.literals.ts` | MainLayout (breadcrumbs, tabs, header) |
| `SessionSidebar.literals.ts` | SessionSidebar (nav links, accordions) |
| `SessionPopover.literals.ts` | SessionPopover |

### Fase 3: Channel Components (14 vistas)

| Archivo .literals | Componente |
|---|---|
| `AddMemberModal.literals.ts` | AddMemberModal |
| `ChannelCard.literals.ts` | ChannelCard |
| `ChannelChatArea.literals.ts` | ChannelChatArea header |
| `ChannelContextModal.literals.ts` | ChannelContextModal |
| `ChannelInput.literals.ts` | ChannelInput |
| `ChannelMembersModal.literals.ts` | ChannelMembersModal |
| `ChannelMessageList.literals.ts` | ChannelMessageList |
| `ChannelMessages.literals.ts` | ChannelMessages |
| `ChannelSettingsModal.literals.ts` | ChannelSettingsModal |
| `ChannelBenchmarkPanel.literals.ts` | ChannelBenchmarkPanel |
| `ChannelOptimizePanel.literals.ts` | ChannelOptimizePanel |
| `ChannelTaskLedger.literals.ts` | ChannelTaskLedger |
| `MembersPanel.literals.ts` | MembersPanel |
| `OrgChartCard.literals.ts` | OrgChartCard |

### Fase 4: Chat Components (6 vistas)

| Archivo .literals | Componente |
|---|---|
| `ChatArea.literals.ts` | ChatArea header badges |
| `InputArea.literals.ts` | InputArea placeholders, tooltips |
| `MessageList.literals.ts` | MessageList toggle, timestamps |
| `SkillsSelector.literals.ts` | SkillsSelector |
| `ToolsSelector.literals.ts` | ToolsSelector |
| `TasksPanel.literals.ts` | TasksPanel |
| `ContextMeter.literals.ts` | ContextMeter |

### Fase 5: Preview, Workspace & UI (5 vistas)

| Archivo .literals | Componente |
|---|---|
| `PreviewPanel.literals.ts` | PreviewPanel (framework names, buttons) |
| `WorkspacePanel.literals.ts` | WorkspacePanel |
| `WorkspaceFileTree.literals.ts` | WorkspaceFileTree |
| `WorkspaceFileEditor.literals.ts` | WorkspaceFileEditor |
| `IntegrationsTab.literals.ts` | IntegrationsTab |
| `ProvidersTab.literals.ts` | ProvidersTab |
| `McpTab.literals.ts` | McpTab |
| `EnvVarsTab.literals.ts` | EnvVarsTab |

### Fase 6: Server-side strings (opcional, post-MVP)

Los strings del servidor (errores HTTP, mensajes de validacion Zod, logs) quedan en ingles por ahora. Si se necesita, se puede hacer un segundo paso con `server/src/lib/literals/`.

## Estrategia de Commit por Fase

Cada fase es un commit independiente para mantener revisabilidad:
1. `feat(i18n): add LiteralsContext, useLiterals hook, and locale toggle`
2. `feat(i18n): add literals for pages (Login, Dashboard, Agents, Channels, Settings, Skills, Logs, Lab)`
3. `feat(i18n): add literals for layout and sidebar`
4. `feat(i18n): add literals for channel components`
5. `feat(i18n): add literals for chat components`
6. `feat(i18n): add literals for preview, workspace, and settings tabs`

## Criterios de Aceptacion

- [ ] `useLiterals` hook devuelve strings correctamente tipados para el locale activo
- [ ] Locale persiste en localStorage y sobrevive refrescos
- [ ] Selector de idioma en Settings > General
- [ ] Deteccion automatica ES/EN al primer render
- [ ] No hay regresion visual: los strings traducidos se ven identicos en estructura
- [ ] Build de produccion pasa (bun run build en client)
- [ ] 100% de literales visibles en UI cubiertos (sin strings harcodeados restantes)

## Metricas

- ~40 archivos `.literals.ts` a crear
- ~69 archivos `.tsx` a modificar (import + reemplazar strings)
- 2 locales iniciales: es, en
- ~500-800 strings unicos a extraer y traducir
