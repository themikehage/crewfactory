COMPLETED ✅ 
# UI Fixes Batch

## 1. SessionPopover: cerrar al seleccionar o crear sesión

**Archivo:** `apps/client/src/components/sidebar/SessionPopover.tsx`

**Problema:** Al hacer clic en una sesión o crear una nueva, el popover no se cierra automáticamente.

**Fix:** Llamar a `onClose()` después de `onSelectSession(id)` y `onNewSession(id)` en los handlers correspondientes.

```tsx
// En el handler de selección
const handleSelect = (id: string) => {
  onSelectSession(id);
  onClose();
};

// En el handler de creación (después de obtener el nuevo sessionId)
const handleCreate = async () => {
  const id = await createSession();
  onNewSession(id);
  onClose();
};
```

---

## 2. SessionPopover: botón de eliminar con icono de papelera (lucide-react)

**Archivos:** `apps/client/src/components/sidebar/SessionPopover.tsx`

**Problema:** El botón de eliminar sesión usa un SVG inline de una X, es pequeño, y solo aparece en hover (`opacity-0 group-hover:opacity-100`). No se ve bien.

**Fix:**
1. Instalar `lucide-react` en `apps/client`
2. Reemplazar el SVG inline de la X por `Trash2` de lucide
3. Hacer el botón siempre visible (sacar `opacity-0 group-hover:opacity-100`)
4. Darle mejor tamaño y padding

```bash
cd apps/client && bun add lucide-react
```

```tsx
import { Trash2 } from "lucide-react";
// ...
<button className="... text-muted-foreground hover:text-destructive">
  <Trash2 size={14} />
</button>
```

---

## 3. Botón "+" para crear sesión sin abrir el popover

**Archivo:** `apps/client/src/components/layout/MainLayout.tsx`

**Problema:** Para crear una nueva sesión hay que abrir el SessionPopover y hacer clic en "New Session". No hay un acceso directo.

**Fix:** Agregar un botón "+" al lado del botón que abre el SessionPopover (en el header, junto al ícono de sesiones). Al hacer clic, llama directamente a `onNewSession` sin abrir el popover.

```tsx
<button onClick={handleQuickCreate} title="Nueva sesión">
  <Plus size={16} />
</button>
```

---

## 4. Syntax highlighting en vista previa de archivos

**Archivo:** `apps/client/src/components/workspace/WorkspaceFileEditor.tsx`

**Problema:** El editor/previsualizador de archivos muestra código plano sin syntax highlighting. En los mensajes ya hay un `RichMarkdown` con syntax highlighting, se puede reutilizar el mismo approach.

**Fix:** Si el archivo tiene una extensión de código reconocible (`.ts`, `.tsx`, `.js`, `.py`, `.json`, etc.), renderizar el contenido con el mismo sistema de syntax highlighting que `RichMarkdown` (o extraer un helper compartido). Usar `shiki` o el built-in del markdown renderer.

Alternativa: usar un `<pre>` con clases de highlight inline si el RichMarkdown ya parsea bloques de código. Extraer un componente `<SyntaxHighlighter lang={ext} code={content} />` que se pueda usar tanto en `RichMarkdown` como en `WorkspaceFileEditor`.

---

## 5. Click en imagen abre modal con vista ampliada

**Archivo:** `apps/client/src/components/chat/ImageGrid.tsx`

**Problema:** Las imágenes se muestran en grilla pero no se pueden ver en grande.

**Fix:** Agregar un modal al hacer clic en cualquier imagen de la grilla:

```tsx
const [previewUrl, setPreviewUrl] = useState<string | null>(null);

// En el JSX: al hacer clic en una imagen
<img onClick={() => setPreviewUrl(url)} className="cursor-pointer" />

// Modal con la imagen ampliada
{previewUrl && (
  <ImagePreviewModal
    url={previewUrl}
    onClose={() => setPreviewUrl(null)}
  />
)}
```

El modal debe:
- Ocupar toda la pantalla (fixed inset-0)
- Fondo oscuro semitransparente
- Imagen centrada con max-h-[90vh] max-w-[90vw] object-contain
- Cerrar con clic fuera, clic en X, o Escape

---

## 6. Botón de historial de experimentos → "Historial"

**Archivo:** `apps/client/src/components/layout/MainLayout.tsx` (línea ~306)

**Problema:** Cuando se está en la vista de laboratorio, la pestaña activa dice "Laboratorio". El usuario prefiere que diga "Historial".

**Fix:** Cambiar el label de la pestaña activa de "Laboratorio" a "Historial" en la línea 306.

```tsx
{route.page === "laboratory" ? (
  <span className="...">
    Historial   {/* antes: Laboratorio */}
  </span>
) : ...}
```

---

## 7. Sidebar: no mostrar chat como activo en vistas no-sesión

**Archivo:** `apps/client/src/components/sidebar/SessionSidebar.tsx` (+ `MainLayout.tsx`)

**Problema:** Al navegar a páginas como Laboratory, Skills, Settings, Agents, Channels, el sidebar mantiene el chat de la sesión anterior como si estuviera activo (highlighted/selected). Esto es confuso porque el chat no está visible.

**Fix:** En el `SessionSidebar`, cuando `route.page` no es `"chat"`, `"workspace"` ni `"preview"`, no mostrar ninguna sesión como activa. Limpiar `activeSessionId` visual en el sidebar para esas rutas.

En `MainLayout`, condicionalmente no renderizar el sidebar con selección de sesión cuando `route.page` no es una vista de sesión.

---

## 8. Alternar tema claro/oscuro

**Archivos nuevos/afectados:**
- `apps/client/src/components/settings/AppearanceTab.tsx` (nuevo)
- `apps/client/src/components/settings/GeneralTab.tsx` (o SettingsPage.tsx)

**Problema:** No hay forma de cambiar entre modo claro y oscuro desde la UI. Actualmente el tema se define estáticamente en `index.html` con la clase `dark`.

**Fix:**
1. Agregar un toggle o selector en Settings (pestaña "Apariencia" o dentro de General)
2. Usar localStorage para persistir la preferencia (`theme: "light" | "dark" | "system"`)
3. Al cargar la app, leer localStorage y aplicar/remover la clase `dark` en `<html>`
4. Opciones: Claro, Oscuro, Sistema (sigue `prefers-color-scheme`)

```tsx
const setTheme = (theme: "light" | "dark" | "system") => {
  localStorage.setItem("theme", theme);
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
};
```

---

## 9. Alternar idioma (EN/ES)

**Archivo existente:** `apps/client/src/lib/LiteralsContext.tsx`

**Problema:** Ya hay un sistema de literales EN/ES implementado con archivos `.literals.ts` y `LiteralsContext`, pero no hay un selector de idioma en la UI. Actualmente el `LocaleSelector.tsx` existe pero no está integrado en Settings de forma visible.

**Fix:**
1. Agregar el `LocaleSelector` en la página de Settings (dentro de GeneralTab o en una pestaña nueva)
2. Asegurarse de que `LiteralsContext` persista el locale en localStorage
3. Al cambiar locale, refrescar la UI

El `LocaleSelector.tsx` ya existe en `components/settings/` — solo falta integrarlo en la UI de Settings con un label claro.

---

## 10. MCP: eliminar duplicidad entre primer nivel y settings

**Archivos:**
- `apps/client/src/pages/MCPMarketplacePage.tsx` (vista principal)
- `apps/client/src/components/settings/McpTab.tsx` (dentro de Settings)

**Problema:** Hay dos lugares para gestionar MCPs: la página principal dedicada (`/mcps`) y una pestaña dentro de Settings. Esto causa confusión y posible desincronización de estado.

**Fix:** Decidir una sola fuente de verdad:
- Opción A: Mover todo a `/mcps` como página principal, eliminar `McpTab.tsx` de Settings y redirigir desde Settings.
- Opción B: Mantener ambas pero sincronizar estado mediante un contexto compartido o refetch al montar.
- Opción recomendada (A): Una sola página dedicada `/mcps`. Settings muestra un enlace "Configurar MCPs →" que navega a `/mcps`. La vista principal es más rica (Marketplace, galería, conexión) mientras que la pestaña en Settings es un duplicado limitado.

---

## 11. Fotos de perfil para agentes (CRUD)

**Archivos:**
- `apps/client/src/pages/AgentsPage.tsx`
- `apps/server/src/routes/agents.ts`
- `packages/shared/src/schemas.ts`

**Problema:** Los agentes no tienen foto de perfil. Solo muestran iniciales en un círculo de color.

**Fix:**
1. **Schema:** Agregar `avatarUrl?: string` al `AgentDefinitionSchema` en `packages/shared`
2. **Backend:**  
   - Endpoint `POST /api/agents/:id/avatar` para subir imagen (multipart form → workspace avatar dir)
   - Endpoint `DELETE /api/agents/:id/avatar` para eliminar
   - Endpoint `GET /api/agents/:id/avatar` para servir la imagen
3. **Frontend:**  
   - En `AgentsPage.tsx`, al editar un agente, mostrar un avatar clickeable
   - Al hacer clic: menú con "Subir foto", "Eliminar foto"
   - Usar `<input type="file" accept="image/*" />` para la subida
   - Mostrar la imagen en el círculo del agente (reemplazando las iniciales)
   - Previsualizar antes de guardar
4. **Workspace:** Guardar avatares en `/tmp/crewfactory/{username}/agents/{agentId}/avatar.*`
