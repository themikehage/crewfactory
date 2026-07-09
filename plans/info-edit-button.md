# Info/Edit Button for Projects and Agents

Anadir un boton de informacion en las vistas de proyectos y agentes que permita ver todos los datos disponibles (incluyendo los que actualmente estan ocultos) y editarlos si es necesario.

## Estado Actual

### Proyectos
- Solo se puede editar el nombre (rename modal)
- `cloneUrl` se almacena en `project.json` pero NUNCA se muestra en la UI
- `createdAt` existe pero no se muestra
- Las ejecuciones por proyecto existen en disco pero no hay UI para verlas
- No hay una pagina/modal de detalle/edicion de proyecto

### Agentes
- El modal `RegisterModal` ya expone la mayoria de campos (name, role, systemPrompt, model, skills, port, avatar)
- `serialTools` existe en `AgentDefinitionSchema` y es funcional pero esta COMPLETAMENTE OCULTO del modal
- `blueprintId` tambien esta oculto

## Solucion Propuesta

### Fase 1: Boton Info en Proyectos

Anadir un modal de "Project Info" accesible desde la tarjeta del proyecto en `DashboardPage` y desde la cabecera cuando se esta dentro de un proyecto.

**Datos a mostrar:**
- `name` (editable inline)
- `id` (solo lectura, con boton copiar)
- `cloneUrl` (editable si se configuro, visible siempre)
- `createdAt` (solo lectura, con formato legible)
- `path` en disco (solo lectura)

**Modal:**
- Mismo diseno que los modales existentes (fondo overlay, card centrada, animacion Framer Motion)
- Inputs editables para name, cloneUrl
- Solo lectura para id, createdAt, path
- Boton "Save Changes" para persistir via `PATCH /api/workspace-projects/:id`

### Fase 2: Boton Info en Agentes

Anadir los campos faltantes al modal de edicion existente (`RegisterModal`).

**Campos a anadir:**
- `serialTools` - lista de checkboxes con todas las tools disponibles (de `AVAILABLE_TOOLS` en schemas.ts), con tooltip explicativo
- `blueprintId` - solo lectura (oculto si es null)
- `createdAt` - solo lectura con formato legible

**Modal:**
- Actualmente el `RegisterModal` alterna entre crear y editar. Seccion nueva "Advanced" o "Config" al final.
- `serialTools` como checkboxes en grid
- El `PATCH /api/agents/:id` ya soporta `serialTools` en `UpdateAgentDefinitionSchema`

### Fase 3: Popover/Button de Acceso

**En proyectos:**
- Boton icono informacion "(i)" en la tarjeta del `DashboardPage`
- Boton icono "(i)" en la cabecera del proyecto (al lado del nombre en las breadcrumbs/tabs)

**En agentes:**
- Boton icono "(i)" en la tarjeta del `AgentsPage`
- Boton icono "(i)" en la cabecera del agente (SessionSidebar o ChatArea header)

### Consideraciones

- No crear modales separados para info. Reutilizar el mismo patron de overlay modal de Framer Motion que ya existe en el codebase.
- Para proyectos, como no hay schema Zod, considerar anadir un `ProjectSchema` a `packages/shared/src/schemas.ts` para validacion consistente.
- `serialTools` defaults a `["request_approval", "ask_question"]` si no esta configurado. Asegurarse de que el formulario muestre los defaults correctamente.
- El endpoint `PATCH /api/workspace-projects/:id` actualmente solo acepta `{ name }`. Habra que extenderlo para aceptar tambien `{ cloneUrl }`.
