Aquí está el reporte completo de coherencia de almacenamiento:

---

# Reporte de Coherencia de Almacenamiento — CrewFactory

## 1. Topografía de Almacenamiento

El sistema usa **tres árboles de directorios raíz** en `/tmp/`, sin base de datos. Todo se persiste en JSON/JSONL plano en disco.

### 1.1 Rutas Base

| Raíz | Propósito | Aislamiento |
|---|---|---|
| `/tmp/crewfactory/{username}/` | Datos por usuario | **Sí** — username del JWT |
| `/tmp/pi-channels/{channelId}/` | Canales multi-agente | **NO** — ruta global |
| `/tmp/pi-agents/{agentId}/` | Agentes programáticos | **NO** — ruta global |

### 1.2 Archivos por Entidad

```
/tmp/crewfactory/{username}/
├── env.json                     # Variables de entorno del usuario
├── auth.json                    # API keys de LLM providers
├── credentials.json             # passwordHash (bcrypt, base64)
├── integrations.json            # Templates de integraciones + bindings
├── sessions/{sessionId}/
│   ├── metadata.json            # name, repoName, agentId, channelId, tools[]
│   ├── *.jsonl                  # Mensajes de sesión (SDK managea)
│   └── tasks.json               # Task Runner state
└── workspace/
    ├── repos/{repoName}/
    │   ├── .preview.json        # Config de build preview
    │   └── ... (git repo)
    ├── assets/uploads/
    ├── assets/generated/
    ├── memories/repos/
    └── memories/sessions/

/tmp/pi-channels/{channelId}/
├── channel.json                 # Definición del canal (metadata, miembros, contexto)
└── messages.jsonl               # Historial append-only de mensajes

/tmp/pi-agents/{agentId}/
├── definition.json              # Definición del agente
├── workspace/                   # Workspace aislado del agente
└── sessions/main/*.jsonl        # Mensajes de sesión del agente
```

---

## 2. Análisis de Scope por Entidad

### 2.1 Sesiones (`sessionId`)

- **Storage**: `/tmp/crewfactory/{username}/sessions/{sessionId}/`
- **Scope correcto**: El username del JWT aísla las sesiones por usuario. Un usuario A **no puede** leer/borrar sesiones del usuario B.
- **Contextos híbridos**: `metadata.json` almacena `repoName`, `agentId`, `channelId` opcionales. Esto permite que una sesión se asocie a un repo, agente, o canal.
- **Problema**: `metadata.json` se reescribe completo en cada `saveSessionMetadata()` (L416-425), incluyendo campos que no cambiaron (race condition potencial si dos writes ocurren casi simultáneamente).

### 2.2 Canales (`channelId`)

- **Storage**: `/tmp/pi-channels/{channelId}/` — **ruta global, sin username**
- **Scope ROTO**: Cualquier usuario autenticado puede:
  - Listar todos los canales (`channelStore.listChannels()`)
  - Leer cualquier canal (`GET /api/channels/:id`)
  - Enviar mensajes a cualquier canal
  - **No hay verificación de pertenencia (membership) en las rutas REST** — solo en el orquestador al momento de dispatchear.
- **members[]**: Se almacena como parte de `channel.json`, pero solo controla el enrutamiento de mensajes entre agentes, **no** el acceso REST.
- **messages.jsonl**: Append-only, sin rotación. Un canal muy activo puede generar archivos enormes que se leen completos en cada `getMessages()` (L138-157).

### 2.3 Agentes Programáticos (`agentId`)

- **Storage**: `/tmp/pi-agents/{agentId}/` — **ruta global, sin username**
- **Scope ROTO**: Similar a canales:
  - `agentRegistry.list()` retorna **todos** los agentes registrados
  - Cualquier usuario puede crear/eliminar agentes
  - **No hay asociación usuario → agente** en el storage
- **Reinicio**: `agentRegistry.init()` escanea `/tmp/pi-agents/` al arrancar y re-registra agentes persistentes. Si hay agentes de otro usuario (en multi-tenant), se restauran automáticamente sin verificación de dueño.
- **Workspace compartido**: `create-agent-server.ts` (L28) usa `username = "admin"` hardcodeado para obtener el `authStorage` y `modelRegistry`. Esto significa que los agentes programáticos **siempre usan las API keys del usuario admin**, no del usuario que los creó.

### 2.4 Sesiones en Canales

- Una sesión puede tener `channelId` seteado. El workspace se resuelve a `/tmp/pi-channels/{channelId}/workspace/`.
- **Problema**: `getOrCreateSession()` (L243-244) redirige el workspace al path del canal. Este workspace es **global**, accesible por cualquier usuario. Dos usuarios con sesiones en el mismo canal compartirían el mismo workspace filesystem.

### 2.5 Sesiones en Agentes

- Similar a canales: workspace se resuelve a `/tmp/pi-agents/{agentId}/workspace/`, que es global.

---

## 3. Análisis de Seguridad

### 3.1 Autenticación y Autorización

| Aspecto | Estado | Riesgo |
|---|---|---|
| JWT en localStorage | Plano, sin HttpOnly | XSS → token robado |
| JWT en query params | `?token=` en URLs de workspace files, preview iframe, imágenes | Filtrado en server logs, referrer headers, browser history |
| Auth middleware | Solo verifica JWT, no scopes/roles | OK para single-user |
| `getUsername()` helper | Acepta `?token=` **y** `Authorization: Bearer` | Conveniente pero expande superficie |
| API keys en disco | `auth.json` en texto plano sin cifrado | Cualquier proceso en el contenedor puede leerlas |
| `env.json` | Texto plano, valores sensibles | Los valores se ocultan en API responses pero están en disco |

### 3.2 Aislamiento entre Usuarios

| Entidad | Aislada por username? | Notas |
|---|---|---|
| Sesiones | ✅ Sí | Path incluye username |
| Workspace files | ✅ Sí | `validateWorkspacePath()` con username |
| env.json / auth.json | ✅ Sí | Path incluye username |
| Canales | ❌ NO | Ruta global, sin username en path |
| Agentes | ❌ NO | Ruta global, sin username en path |
| Channel messages | ❌ NO | Global, cualquier usuario puede leer |

### 3.3 Path Traversal

- **Files route**: `validateWorkspacePath()` (L8-26) usa `resolve()` + `startsWith()` — protección correcta.
- **Session files**: `filesRouter.get("/sessions/:sessionId/files/*")` (L31-73) solo verifica `..` manualmente (L35). Débil pero mitigado porque el path base incluye el sessionId que es un UUID.
- **Workspace upload**: Doble verificación: primero `validateWorkspacePath()`, luego `resolve()` + `startsWith()` otra vez (L354-361).

### 3.4 Credenciales en URL (Crítico)

Dos componentes exponen el JWT como query param en URLs:
- `WorkspaceFileEditor.tsx` — `?raw=true&token=...` y `?download=true&token=...`
- `ImageGrid.tsx` — `?token=...` en imágenes
- `PreviewPanel.tsx` — `&token=...` en iframe src

**Impacto**: Cualquier URL que contenga `?token=` queda en:
- Browser history
- Server logs (Bun/Hono)
- `Referer` header si hay recursos externos
- Iframe embebido (preview puede leakear el token)

---

## 4. Análisis de Rendimiento

### 4.1 Operaciones Síncronas Bloqueantes

**Prácticamente todas las operaciones de filesystem son síncronas**:

| Operación | Frecuencia | Impacto |
|---|---|---|
| `readFileSync` metadata.json | Cada listado de sesiones (por sesión) | Blockea event loop |
| `writeFileSync` metadata.json | Cada rename, tool persist, task state change | Blockea event loop |
| `readFileSync` messages.jsonl | Cada getMessages() — lee **todo** el archivo | Escala mal con canales grandes |
| `readdirSync` session dirs | `listSessions()` — escanea + parsea 500 líneas por sesión | O(n) sesiones, bloqueante |
| `writeFileSync` env.json | Cada set/delete de env var | Blockea |
| `existsSync` + `mkdirSync` | En casi toda operación (ensure dirs) | Blockea |

**Ejemplo**: Si un usuario tiene 50 sesiones, `listSessions()` hace:
- 1 `readdirSync` + 50 `readFileSync` (metadata) + 50 `readdirSync` (jsonl) + 50 `readFileSync` (jsonl, 500 líneas cada uno). **Todo síncrono**.

### 4.2 Channel Messages — Cuello de Botella

```typescript
// channel-store.ts L138-157
getMessages(channelId, limit, sessionId) {
  const content = readFileSync(messagesPath, "utf-8"); // Lee TODO el archivo
  const lines = content.trim().split("\n");
  const messages = [];
  for (const line of lines) {
    messages.push(JSON.parse(line)); // Parsea cada línea
  }
  return messages.slice(-limit); // Descarta la mayoría
}
```

- Cada `getMessages()` en un canal con 10,000 mensajes lee y parsea **10,000 líneas** para devolver las últimas 100.
- No hay truncation, rotación, ni archive de `messages.jsonl`.
- El rewrite de `channel.json` en cada `appendMessage()` (L131-135) es innecesario — solo necesita actualizar `updatedAt`.

### 4.3 Session Listing — O(n) Pesado

```typescript
// session-manager.ts L427-495
listSessions(username) {
  readdirSync(sessionsDir)           // 1 sync read
  for each session:                  // para CADA sesión:
    readFileSync(metadata.json)      //   1 sync read
    readdirSync(session dir)         //   1 sync read
    for each jsonl file:             //   por cada archivo:
      readFileSync(jsonl)            //     1 sync read
      split + parse 500 lines        //     parseo de líneas
}
```

### 4.4 Escrituras Innecesarias

- `metadata.json` se reescribe **completo** aunque solo cambie un campo.
- `channel.json` se reescribe **en cada mensaje** (para actualizar `updatedAt`). Esto duplica writes.
- `integrations.json` se reescribe completo en cada save.

### 4.5 Race Conditions Potenciales

- `saveSessionMetadata()` (L416-425): Read-modify-write sin lock. Dos llamadas concurrentes → una sobrescribe a la otra.
- `persistSessionTools()` (L497-506): Mismo patrón.
- `env.json` setters: Mismo patrón.

---

## 5. Resumen de Problemas Detectados

### 🔴 Críticos

1. **Canales y Agentes sin aislamiento por usuario** — Rutas globales (`/tmp/pi-channels/`, `/tmp/pi-agents/`). Cualquier usuario autenticado puede acceder a cualquier canal/agente.
2. **JWT en query params** — Exposición de credenciales en URLs, logs, referrers, y browser history.
3. **API keys en texto plano** — `auth.json` no está cifrado en disco.

### 🟡 Altos

4. **`create-agent-server.ts` hardcodea `username = "admin"`** — Todos los agentes programáticos usan las API keys del admin, no del usuario creador.
5. **`listSessions()` completamente síncrono y O(n)** — Bloquea event loop proporcional al número de sesiones. Con 50+ sesiones se vuelve notable.
6. **`getMessages()` de canales lee y parsea todo el archivo** — Degradación lineal con el uso del canal.
7. **Sin rotación de `messages.jsonl`** — Canales activos generan archivos enormes sin límite.
8. **Race conditions en read-modify-write** — `metadata.json`, `env.json`, `channel.json` pueden corromperse bajo concurrencia.

### 🔵 Medios

9. **Escrituras innecesarias de `channel.json` en cada mensaje** — Duplica I/O en el hot path.
10. **`crewfy-selected-model` nunca se limpia al hacer logout** — Persistencia entre usuarios en el mismo navegador.
11. **`active-repo/agent/channel` sobreviven al logout** — Posible fuga de contexto entre sesiones de diferentes usuarios.
12. **No hay rate limiting ni control de tamaño** — Un usuario puede crear N objetos sin restricción.
13. **`metadata.json` sin lock** — Lectura-escritura no atómica.

### ⚪ Informativos

14. **Workspace de canal/agente compartido entre usuarios** (en multi-tenant).
15. **`messages.jsonl` sin índice** — Búsqueda por `sessionId` escanea todo el archivo.

---

## 6. Recomendaciones Prioritarias

1. **Aislar canales y agentes por usuario**: Agregar `username` al path (`/tmp/pi-channels/{username}/{channelId}/`) y verificar pertenencia en las rutas REST.
2. **Eliminar JWT de query params**: Usar cabecera `Authorization` o tokens de un solo uso (signed URLs) para assets.
3. **Cifrar `auth.json` en reposo**: Usar `crypto.subtle` con una clave derivada del password del usuario, o al menos ofuscar con AES-256-GCM.
4. **Migrar `listSessions()` y `getMessages()` a async I/O**: Usar `fs.promises` para no bloquear el event loop en listados.
5. **Implementar rotación de `messages.jsonl`**: Por fecha o por tamaño (ej. 10MB por archivo, comprimir viejos).
6. **Eliminar rewrite innecesario de `channel.json` en cada mensaje**: Actualizar solo en cambios estructurales (members, context, etc.), no en cada mensaje.
7. **Limpiar localStorage keys sensibles en logout**: `crewfy-selected-model`, `active-repo`, `active-agent`, `active-channel`.
8. **Reemplazar `username = "admin"` hardcodeado** con el username real del usuario que crea el agente.