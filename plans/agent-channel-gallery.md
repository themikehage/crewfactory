# Agent & Channel Gallery

Galería de plantillas reutilizables de agentes y canales. No es un marketplace (sin ventas), es un catálogo donde los desarrolladores comparten y descubren configuraciones listas para usar.

---

## 1. Motivación

Hoy crear un agente o canal requiere escribir system prompts, elegir skills, configurar miembros y contextos desde cero. No hay forma de compartir configuraciones exitosas ni de descubrir combinaciones ya probadas por otros.

La galería resuelve:
- **Descubrimiento**: Un desarrollador novato encuentra un "Technical Writer Agent" listo, no tiene que diseñarlo
- **Compartir**: Un desarrollador experimentado publica su "Full-Stack Dev Channel" con 3 agentes que colaboran
- **Reutilización**: Importar una plantilla con un clic, sin copiar/pegar prompts
- **Iteración rápida**: Probar configuraciones ajenas y adaptarlas

---

## 2. Conceptos

### Agent Blueprint

Configuración exportable de un agente programático:

```yaml
# agent-blueprint.yaml (o json)
name: "Technical Writer"
role: "Documentation Specialist"
systemPrompt: >
  Eres un documentador técnico experto...
skills:
  - factory-repos
  - factory-skills
model: "anthropic/claude-3-5-sonnet-20241022"
tags:
  - documentation
  - writing
  - technical
author: "themikehage"
version: "1.0.0"
```

### Channel Blueprint

Configuración exportable de un canal multi-agente:

```yaml
name: "Full-Stack Dev Team"
description: "Equipo de 3 agentes que colaboran en desarrollo full-stack"
context:
  - key: "STACK"
    value: "React + Bun + Tailwind"
members:
  - agentId: "tech-lead"
    replyMode: "broadcast"
  - agentId: "frontend-dev"
    replyMode: "user-only"
  - agentId: "backend-dev"
    replyMode: "user-only"
maxChainDepth: 5
tags:
  - development
  - full-stack
  - team
author: "themikehage"
version: "2.1.0"
```

### Gallery Item

Cada blueprint lleva metadatos adicionales para la galería:

```yaml
metadata:
  title: "Full-Stack Dev Team"
  description: "Equipo colaborativo de 3 agentes para desarrollo web"
  author: "themikehage"
  avatar: "https://avatars.githubusercontent.com/u/123"
  rating: 4.5
  downloads: 234
  tags: ["development", "full-stack", "team"]
  created: "2026-06-01"
  updated: "2026-06-15"
  version: "2.1.0"
  compatibility: ">=1.0.0"     # Versión mínima de CrewFactory
```

### Blueprint Store (Filesystem)

```
/tmp/crewfactory/{username}/blueprints/
├── index.json                   # Catálogo local (blueprints instalados)
├── agents/
│   ├── technical-writer/        # Blueprint descargado
│   │   ├── blueprint.json       # Definición del agente
│   │   └── icon.svg             # Icono opcional
│   └── code-reviewer/
│       └── blueprint.json
└── channels/
    ├── full-stack-dev-team/
    │   ├── blueprint.json       # Definición del canal
    │   └── icon.svg
    └── security-audit/
        └── blueprint.json
```

---

## 3. Componentes

### 3.1 Core Blueprint System

**Shared schemas** (`packages/shared`):

```typescript
// AgentBlueprintSchema — igual que AgentDefinitionSchema pero con metadatos extra
// ChannelBlueprintSchema — igual que ChannelSchema pero exportable y con metadatos
// GalleryMetadataSchema — rating, downloads, author, version, compatibility, tags
// GalleryIndexSchema — índice local de blueprints instalados
```

### 3.2 Gallery Server (`routes/gallery.ts`)

Endpoints REST:

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET`  | `/api/gallery/blueprints` | Listar blueprints disponibles (remotos) |
| `GET`  | `/api/gallery/blueprints/:id` | Detalle de blueprint remoto |
| `POST` | `/api/gallery/blueprints/:id/install` | Descargar e instalar blueprint |
| `GET`  | `/api/gallery/local` | Listar blueprints instalados localmente |
| `DELETE` | `/api/gallery/local/:type/:id` | Eliminar blueprint local |
| `POST` | `/api/gallery/export` | Exportar agente/canal como blueprint |
| `GET`  | `/api/gallery/search?q=...&tags=...` | Buscar en la galería |

**Almacenamiento remoto**: Los blueprints se almacenan en el propio repositorio de CrewFactory:
- `community/agents/` — blueprints de agentes
- `community/channels/` — blueprints de canales
- `community/index.json` — índice para búsqueda rápida
- PRs al repo = nuevo blueprint

Esto mantiene la galería open-source, curada vía PRs, sin backend externo.

### 3.3 Gallery UI

**`GalleryPage.tsx`** — Ruta `/gallery` en el frontend:

- **Explorar**: Grid de tarjetas con icono, título, descripción, autor, rating, tags
- **Buscar/Filtrar**: Input de búsqueda + chips de tags + filtro por tipo (agent/channel)
- **Detalle**: Modal/página con blueprint completo, vista previa del system prompt, lista de skills, miembros del canal
- **Instalar**: Botón "Install" que llama a `POST /api/gallery/blueprints/:id/install`
- **Mis blueprints**: Pestaña "Installed" con los blueprints que ya tiene el usuario
- **Exportar**: Botón "Export as Blueprint" en la página de detalle de agente/canal

### 3.4 Integración con Agentes y Canales Existentes

- Al instalar un **agent blueprint**:
  - Se llama a `POST /api/agents` con la definición del blueprint
  - El agente queda registrado como si se hubiera creado manualmente
  - Se marca en `definition.json` con `"blueprintId": "technical-writer"` para trackear origen

- Al instalar un **channel blueprint**:
  - Primero verifica que los agentes referenciados existan (o los crea automáticamente si no)
  - Se llama a `POST /api/channels` con la definición del blueprint
  - Se marca en `channel.json` con `"blueprintId": "full-stack-dev-team"`

### 3.5 Repositorio Community

```
crewfactory/community/
├── README.md                    # Cómo contribuir blueprints
├── index.json                   # Índice maestro
├── agents/
│   ├── technical-writer/
│   │   ├── blueprint.json
│   │   └── icon.svg
│   ├── code-reviewer/
│   │   ├── blueprint.json
│   │   └── icon.svg
│   └── ...
└── channels/
    ├── full-stack-dev-team/
    │   ├── blueprint.json
    │   └── icon.svg
    ├── security-audit/
    │   ├── blueprint.json
    │   └── icon.svg
    └── ...
```

Los blueprints se incluyen en el repo de CrewFactory y se sirven estáticamente desde `https://raw.githubusercontent.com/themikehage/crewfactory/main/community/index.json`

---

## 4. UX / Flujo

### 4.1 Explorar Galería

```
Sidebar → "Gallery" → Grid de blueprints
                       ├── [Filtro: Agents | Channels | All]
                       ├── [Búsqueda]
                       ├── [Tags: development, writing, security...]
                       │
                       └── Tarjeta:
                           ├── Icono + Título
                           ├── Autor + Rating (★4.5)
                           ├── Tags
                           └── Botón [Install]
```

### 4.2 Detalle de Blueprint

```
Modal/Página:
├── Header: Título, Autor, Versión, Rating
├── Description
├── Vista previa:
│   ├── [Agent]: System prompt (expandible), Skills list, Model
│   └── [Channel]: Miembros (con replyMode), Context variables, maxChainDepth
├── Compatibility badge
└── Botón [Install] ↗
```

### 4.3 Instalación

```
Click [Install] → Loading spinner
  ├── Server descarga blueprint de GitHub raw
  ├── Server crea agente/canal
  ├── Success toast: "Technical Writer installed! Open in Agents →"
  └── Aparece en "My Blueprints"
```

### 4.4 Exportar

```
Página de detalle de Agente/Canal:
  └── Botón [Export as Blueprint]
      └── Genera blueprint.json + descarga / copia al portapapeles
```

---

## 5. Consideraciones Técnicas

### 5.1 Versionado y Compatibilidad

- `compatibility` en metadata: semver range (`>=1.0.0`, `^2.0.0`)
- Al instalar, el servidor verifica `compatibility` contra la versión actual
- Si es incompatible, muestra advertencia pero permite instalar

### 5.2 Curación vía PRs

- Cualquiera puede hacer fork del repo, añadir su blueprint a `community/agents/` o `community/channels/`, y abrir PR
- El mantenedor revisa: seguridad (system prompts no maliciosos), calidad, formato
- Al mergear, el blueprint aparece automáticamente en la galería (el index se actualiza vía CI o manualmente)

### 5.3 Offline First

- Los blueprints instalados se almacenan localmente en `/tmp/crewfactory/{username}/blueprints/`
- La galería funciona offline para los blueprints ya instalados
- El índice remoto se cachea (TTL: 1 hora)

### 5.4 Privacidad

- No se suben datos de uso ni telemetría
- Los blueprints son archivos estáticos en un repo público
- No hay autenticación para leer la galería (es contenido público)

---

## 6. Orden de Implementación

1. **Core schemas**: `AgentBlueprintSchema`, `ChannelBlueprintSchema`, `GalleryMetadataSchema`
2. **Community repo structure**: `community/index.json` con 2-3 blueprints de ejemplo
3. **Gallery server**: Endpoints REST en `routes/gallery.ts`
4. **Gallery UI**: `GalleryPage.tsx` con grid, búsqueda, filtros, detalle
5. **Instalación**: Integración con agent-registry y channel-store
6. **Exportación**: Botón export en páginas de detalle de agente/canal
7. **PR template**: `community/PULL_REQUEST_TEMPLATE.md` para contributors
8. **CI**: Workflow que valida blueprints nuevos en PRs

---

## 7. Métricas de Éxito

- 10+ blueprints comunitarios en el primer mes
- Tiempo para tener un agente funcional: de 15 min a <1 min
- Blueprints instalados por usuario > 0 (tasa de adopción)
- PRs de blueprints de la comunidad (no solo del mantenedor)
