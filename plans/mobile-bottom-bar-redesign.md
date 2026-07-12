COMPLETED
# Mobile Bottom Bar Redesign

La bottombar de mobile solo debe mostrarse cuando el menu lateral (drawer) esta desplegado. Nunca debe mostrarse en pantallas de chat, home, settings, skills, logs, ni ninguna otra vista.

## Estado Actual

La bottombar se muestra/oculta segun esta logica en `MainLayout.tsx`:

```typescript
// Se muestra cuando:
// - No estamos en chat activo (!isChatActive)
// - O el sidebar esta abierto (sidebarOpen)
{(!isChatActive || sidebarOpen) && <MobileBottomBar ... />}
```

Esto significa que la bottombar se muestra en:
- Home (cuando no hay contexto activo) - **dejara de mostrarse**
- Settings, Skills, Logs, Plugins - **dejara de mostrarse**
- Laboratorio, Workspace, Preview - **dejara de mostrarse**
- Chat activo con sidebar abierto - **se seguira mostrando**
- Home con sidebar abierto - **se seguira mostrando**

Ella contiene los tabs: Home, Skills, Settings, Logs, Plugins.

## Comportamiento Deseado

La bottombar SOLO debe aparecer cuando el drawer del menu esta abierto (`sidebarOpen === true`). En cualquier otro estado, no debe renderizarse.

## Cambios Necesarios

### MainLayout.tsx

Simplificar la condicion de visibilidad de `MobileBottomBar`:

```typescript
// Antes:
{(!isChatActive || sidebarOpen) && <MobileBottomBar ... />}

// Despues:
{sidebarOpen && <MobileBottomBar ... />}
```

Esto implica que la bottombar ahora es parte de la experiencia del drawer/sidebar. Al abrir el menu, los 5 tabs aparecen en la parte inferior para navegacion rapida. Al cerrar el menu, la bottombar desaparece y el contenido del chat/ vista ocupa todo el espacio vertical (`bottom-0`).

### Ajustes de contenido `<main>`

Actualmente el contenido principal ajusta su altura segun si la bottombar esta visible o no:

```typescript
<main className={`absolute inset-x-0 top-0 ${
  isChatActive && !sidebarOpen ? "bottom-0" : "bottom-14"
} z-30 flex flex-col bg-background`}>
```

Con el cambio, la bottombar SOLO se muestra cuando `sidebarOpen` es `true`. El contenido principal debe ocupar siempre `bottom-0` cuando `sidebarOpen` es `false`, y `bottom-14` solo cuando `sidebarOpen` es `true`:

```typescript
<main className={`absolute inset-x-0 top-0 ${
  sidebarOpen ? "bottom-14" : "bottom-0"
} z-30 flex flex-col bg-background`}>
```

### MobileSidebarOverlay.tsx

Actualmente tiene `pb-14` para padding-bottom de la bottombar. Si la bottombar siempre esta presente cuando el sidebar esta abierto, este padding sigue siendo correcto y no necesita cambios.

Sin embargo, verificar que el sidebar se vea bien: el contenido del drawer no debe quedar detras de la bottombar. El `pb-14` ya maneja esto.

### isChatActive / isHome

Las variables `isChatActive` e `isHome` actualmente controlan la visibilidad de la bottombar y el posicionamiento del `<main>`. Con el cambio propuesto:

- `isHome` seguira siendo util para el `MobileTopbar.tsx` (que muestra/oculta el logo segun si es home)
- `isChatActive` ya no es necesaria para el control de bottombar. Se puede eliminar o mantener solo para el `<main>` class (aunque con la nueva logica basada en `sidebarOpen`, tampoco seria necesaria)

**Opcion recomendada:** Simplificar a solo `sidebarOpen`:

```typescript
<main className={`absolute inset-x-0 top-0 ${
  sidebarOpen ? "bottom-14" : "bottom-0"
} z-30 flex flex-col bg-background`}>
```

### Eliminar isChatActive de la condicion

La variable `isChatActive` puede mantenerse en el ambito del layout si se usa en otro lugar (como para el `MobileTopbar` o el `ChatHeader`), pero debe eliminarse de la logica de la bottombar y del `<main>` positioning.

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `apps/client/src/components/layout/MainLayout.tsx` | Simplificar condicion de bottombar a `{sidebarOpen && <MobileBottomBar .../>}` y ajustar clase del `<main>` para usar solo `sidebarOpen` |
| `apps/client/src/components/layout/mobile/MobileBottomBar.tsx` | No necesita cambios (solo recibe props, no decide visibilidad) |
| `apps/client/src/components/layout/mobile/MobileSidebarOverlay.tsx` | Verificar que `pb-14` siga siendo correcto (deberia) |

## Consideraciones

- La animacion del drawer (Framer Motion) ya maneja transiciones suaves de entrada/salida. La bottombar aparecera y desaparecera con el drawer.
- Los tabs de la bottombar (Home, Skills, Settings, Logs, Plugins) solo seran accesibles desde el drawer, no desde las vistas normales. Esto es intencional.
- No afecta a desktop: la bottombar solo se renderiza en mobile (`isMobile` check en la logica del layout se mantiene igual).
- El `MobileTopbar.tsx` tiene un boton `[≡]` que abre el drawer (`setSidebarOpen(true)`). Al abrirlo, la bottombar aparecera. Al seleccionar un tab o cerrar el drawer, la bottombar desaparecera.
