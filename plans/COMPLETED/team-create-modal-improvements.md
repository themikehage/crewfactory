COMPLETED
# Plan: Mejoras en el modal de creacion de equipo (CreateTeamModal)

## Problema

El `CreateTeamModal` en `TeamsPage.tsx` tiene tres carencias vs. el `RegisterModal` de agentes:

1.  **Usa `<select>` nativo** en vez del `<Dropdown>` personalizado del proyecto (definido en `apps/client/src/components/ui/Dropdown.tsx`).
2.  **No permite seleccionar miembros** durante la creacion — solo se asigna el lider. Los miembros se agregan post-creacion via `TeamMembersModal`.
3.  **Solo permite URL textual** para el avatar, no permite subir imagen desde el ordenador ni elegir avatares por defecto, a diferencia del `RegisterModal` de agentes.

## Alcance

Archivos a modificar:

| Archivo | Cambio |
|---|---|
| `apps/client/src/pages/TeamsPage.tsx` | Reemplazar `<select>` por `<Dropdown>`, agregar selector de miembros, agregar upload de imagen/avatares default |
| `apps/client/src/pages/TeamsPage.literals.ts` | Agregar literales nuevos (ES/EN) |
| `apps/server/src/routes/teams.ts` | Agregar endpoints `POST /:id/avatar` y `DELETE /:id/avatar` |
| `packages/shared/src/schemas.ts` | (opcional) Si `uploadAvatar` del hook necesita enviar el avatar |

## Cambios detallados

### 1. Reemplazar `<select>` nativo por `<Dropdown>`

- Importar `Dropdown` de `@/components/ui/Dropdown`
- Convertir `registeredAgents` en opciones para el Dropdown
- Usar `placeholder` "Select a leader agent..." y `matchWidth` para que el popover coincida con el ancho del trigger
- Pasar `renderOption` para mostrar nombre + ID del agente (como se hace en otros dropdowns del proyecto)

### 2. Agregar selector de miembros multi-seleccion

- Agregar estado `selectedMembers: string[]` (IDs de agentes adicionales)
- Mostrar un area de "Team Members" con checkboxes o badges seleccionables de los agentes registrados (excluyendo al lider)
- En el submit, incluir los miembros seleccionados en el array `members` con `role: "member"` (el lider ya va con `role: "lead"`)
- Usar `AgentAvatar` + nombre para cada opcion

### 3. Reemplazar input de URL por upload de imagen + default avatars

- Agregar estado `avatarFile: File | null` y `avatarPreview: string | null`
- Agregar estado `selectedDefaultAvatar: string | null` (reutilizar `DEFAULT_AVATARS` de `@/lib/defaultAvatars`)
- Mostar preview del avatar con `AgentAvatar`
- Input `type="file" accept="image/*"` como en `RegisterModal`
- Grid de default avatars como en `RegisterModal`
- En el submit, si hay `avatarFile`, hacer el upload una vez creado el team (mismo patron que `RegisterModal`):
  - Recibir el `id` del team creado
  - Llamar a `uploadTeamAvatar(id, avatarFile)` 
  - Necesitaremos agregar `onUploadAvatar` al modal y los hooks correspondientes

### 4. Endpoints nuevos en el servidor (`apps/server/src/routes/teams.ts`)

Siguiendo el mismo patron de `agents.ts`:

- `POST /api/teams/:id/avatar` — recibe un `FormData` con campo `file`, lo guarda como `avatar.{ext}` en el directorio del team, setea `avatarUrl` en el team.json
- `DELETE /api/teams/:id/avatar` — elimina el archivo de avatar y limpia `avatarUrl`
- `GET /api/teams/:id/avatar` — sirve el archivo de avatar estaticamente

Nota: averiguar como se obtiene el directorio base del team — usar `getTeamDir` de shared.

### 5. Hook `useTeams` — agregar `uploadTeamAvatar` y `deleteTeamAvatar`

Mismo patron que `useAgents`:

```ts
const uploadTeamAvatar = useCallback(async (id: string, file: File): Promise<string> => {
  const formData = new FormData();
  formData.append("file", file);
  const res = await apiFetch(`/api/teams/${id}/avatar`, {
    method: "POST",
    body: formData,
  });
  ...
}, [fetchTeams]);
```

### 6. Literales nuevos

Agregar en `TeamsPage.literals.ts`:

```ts
membersLabel: "Team Members (optional)" / "Miembros del Equipo (opcional)"
membersPlaceholder: "Select additional members..." / "Selecciona miembros adicionales..."
uploadAvatar: "Upload Image" / "Subir Imagen"
removeAvatar: "Remove" / "Eliminar"
defaultAvatars: "Default Avatars" / "Avatares por Defecto"
```

## Flujo resultante

1. Usuario abre modal de crear equipo
2. Completa nombre, descripcion (igual que antes)
3. Avatar: ve preview con `AgentAvatar`, puede subir archivo o elegir default avatar (igual que RegisterModal)
4. Team Type: igual que antes (botones Negotiation/Orchestration)
5. Team Leader: dropdown custom con busqueda visual de agentes
6. Team Members: area multi-select con checkboxes de agentes disponibles (excluyendo al lider)
7. Submit:
   - Se crea el team con `POST /api/teams`
   - Si hay avatar file, se sube a `POST /api/teams/{id}/avatar`
   - Se cierra el modal
