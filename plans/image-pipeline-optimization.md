# Image Pipeline Optimization Plan

Optimizar el almacenamiento, servicio y renderizado de imagenes (subidas por el usuario y generadas por agentes) con caching HTTP, thumbnails, compresion y auth nativa.

## Diagnostico Actual

### Flujo de subida (usuario)
1. `processAttachments()` en `ChatInput.tsx` convierte imagenes a base64 (para vision LLM) + sube via `FormData` a `POST /api/workspace/assets/uploads?...`
2. El servidor (`files.ts:491-552`) escribe el buffer directo a disco con `writeFileSync`, sin compresion ni validacion de tamano
3. La ruta de la imagen se inyecta como `[Attached File: path]` en el prompt

### Flujo de generacion (agente)
1. `generate_image` tool (`image-gen-tool.ts`) y `runImageGenModel()` guardan en `{workspaceDir}/assets/generated/img_{timestamp}_{random}.png`
2. Las imagenes generadas se guardan tal cual las devuelve el modelo (normalmente PNG)

### Flujo de servicio
1. `GET /api/workspace/*?raw=true` streamea el archivo con `Bun.file().stream()` — **sin `Cache-Control`, `ETag`, `Last-Modified`**
2. `GET /api/sessions/:id/files/*` — igual, sin headers de cache
3. `GET /api/agents/:id/avatar` — sin headers de cache

### Flujo de renderizado (frontend)
1. `AuthenticatedImage` usa `fetch()` → `blob` → `createObjectURL` → `<img>` — **bypassea el cache HTTP del navegador, el preloader, y requiere JS**
2. `const token = ""` hardcodeado — el backend soporta `?token=` para `<img>` nativo pero el frontend nunca lo usa
3. `IntersectionObserver` con 200px rootMargin para lazy loading (esto es correcto)
4. Las vistas grid (`aspect-square`, 200-300px) cargan la imagen a resolucion completa

### Problemas
| Problema | Severidad | Uploads | Generadas |
|----------|-----------|---------|-----------|
| Sin `Cache-Control` / `ETag` | Critica | Si | Si |
| Sin thumbnails (grid carga full-res) | Critica | Si | Si |
| `AuthenticatedImage` bypassa cache nativo | Alta | Si | Si |
| `?token=` sin usar en frontend | Alta | Si | Si |
| Sin compresion/WebP en upload | Media | Si | N/A |
| Sin limite de tamano en upload | Media | Si | N/A |
| Sin `Range` / `Accept-Ranges` | Baja | Si | Si |
| `resolveImageUrl` / `resolveFileUrl` duplicados | Baja | Si | Si |
| Sin stripping de metadata en upload | Baja | Si | N/A |

---

## Fases

### Fase 1: Caching HTTP en Endpoints de Assets

**Objetivo:** Reducir requests repetidos a disco. Cada imagen se sirve con headers que permiten al navegador cachear y validar condicionalmente.

1. **Agregar headers de cache a `GET /api/workspace/*?raw=true`:**
   - `Cache-Control: public, max-age=3600, immutable` para archivos en `assets/generated/` (nunca cambian).
   - `Cache-Control: public, max-age=3600` para archivos en `assets/uploads/` (pueden cambiar si el usuario re-subio).
   - `ETag` basado en `mtimeMs` del archivo (`W/"<mtime>"`).
   - `Last-Modified` basado en `mtime`.
   - Soporte para `If-None-Match` → `304 Not Modified`.
   - Soporte para `If-Modified-Since` → `304 Not Modified`.

2. **Agregar los mismos headers a `GET /api/sessions/:id/files/*`.**

3. **Agregar los mismos headers a `GET /api/agents/:id/avatar`.**

4. **Crear utilidad compartida `applyCacheHeaders(c, filePath, immutable?)` en `apps/server/src/core/cache-headers.ts`:**
   ```typescript
   export function applyCacheHeaders(
     c: Context,
     filePath: string,
     opts?: { immutable?: boolean; maxAge?: number }
   ): Response | null
   ```
   - Retorna `304` si `If-None-Match` o `If-Modified-Since` matchean.
   - Retorna `null` si hay que servir el archivo completo (el caller agrega headers y streamea).

5. **Verificar con `curl -I` que los headers aparecen:**
   ```bash
   curl -I "http://localhost:3000/api/workspace/assets/generated/img_123.png?raw=true"
   # HTTP/1.1 200 OK
   # Cache-Control: public, max-age=3600, immutable
   # ETag: "1710777600000"
   # Last-Modified: Mon, 18 Mar 2026 12:00:00 GMT
   ```

### Fase 2: Thumbnails On-the-Fly con Sharp

**Objetivo:** Servir versiones redimensionadas para vistas grid sin modificar los archivos originales. El original se usa solo en lightbox/download.

1. **Instalar `sharp` en `apps/server`:**
   ```bash
   cd apps/server && bun add sharp
   ```

2. **Crear `apps/server/src/core/image-thumbnail.ts`:**
   - `getThumbnailPath(originalPath: string, width: number): string` — retorna ruta al thumbnail cacheado.
   - `generateThumbnail(originalPath: string, width: number): Promise<string>` — genera thumbnail con sharp y lo guarda en `{workspaceDir}/.thumbnails/{width}/{relativePath}`.
   - La generacion usa `.resize(width, null, { fit: "inside", withoutEnlargement: true })` y `.webp({ quality: 80 })`.
   - `serveThumbnail(c: Context, originalPath: string, width: number)` — endpoint handler que sirve el thumbnail con caching agresivo.

3. **Endpoint `GET /api/workspace/thumbnail/:width/*`:**
   - Parametro `width`: 200, 400, 800 (predefinidos; rechazar otros).
   - Genera thumbnail on-demand si no existe en cache.
   - Headers de cache: `Cache-Control: public, max-age=604800, immutable` (1 semana).
   - ETag basado en mtime del original + width.

4. **Actualizar `resolveImageUrl()` en ImageGrid:**
   - En modo grid (multiples imagenes): redirigir a `/api/workspace/thumbnail/400/...`.
   - En modo single: mantener ruta original para `max-h-[70vh]`.
   - En lightbox: mantener ruta original.
   - En download: mantener ruta original.

5. **Limpiar thumbnails huerfanos:**
   - Al eliminar un archivo original via `DELETE /api/workspace/*`, borrar tambien sus thumbnails cacheados.
   - Opcional: `bun scripts/clean-thumbnails.ts` que elimina thumbnails cuyo original ya no existe.

### Fase 3: Autenticacion Nativa para `<img>` Tags

**Objetivo:** Eliminar la doble indireccion `fetch()` → `blob` → `createObjectURL` y permitir que el navegador use su cache nativo.

1. **Generar token de sesion para el frontend:**
   - Agregar campo `imageToken` en la respuesta de `GET /api/sessions/:id` (token JWT de corta duracion, 1h, scope solo lectura de assets).
   - O usar el token de sesion existente via `sessionManager.getSessionToken()`.

2. **Exponer `imageToken` al cliente:**
   - Agregar `imageToken` al contexto de sesion (`useSession` hook).
   - Pasar `imageToken` como prop a `ImageGrid` y `AuthenticatedImage`.

3. **Refactorizar `AuthenticatedImage`:**
   - En lugar de `fetch()` → `blob` → `createObjectURL`, simplemente renderizar `<img src={url}?token={imageToken} />`.
   - Mantener `IntersectionObserver` + `loading="lazy"` (el navegador cachea la response y no re-descarga).
   - Eliminar `blobUrl` state, `loadImg` async, y `URL.revokeObjectURL`.
   - Simplificar el componente de ~60 lineas a ~15 lineas.

4. **Refactorizar `downloadImage()` y `openImageInNewTab()`:**
   - Usar `apiFetch()` con la URL + `?token=` para obtener el blob y forzar download.
   - El caso `openImageInNewTab` puede usar `<a href="..." target="_blank">` con el token.

5. **Limpiar `const token = ""` en todos los componentes:**
   - `ImageGrid.tsx` (lineas 104, 167, 203)
   - `MessageBlocks.tsx`
   - `ShareFileCard.tsx`
   - `ToolResultInspector.tsx`

### Fase 4: Compresion y Validacion en Upload

**Objetivo:** Reducir almacenamiento y ancho de banda comprimiendo imagenes al subir.

1. **Limite de tamano en upload:**
   - Variable de entorno `CREWFACTORY_MAX_UPLOAD_SIZE_MB` (default: 50).
   - Validar `Content-Length` antes de parsear el multipart.
   - Rechazar con `413 Payload Too Large` si excede.

2. **Compresion de imagenes en upload con sharp:**
   - Si el MIME type es imagen (`image/jpeg`, `image/png`, `image/webp`, etc.):
     - Convertir a WebP (`sharp().webp({ quality: 85 })`).
     - Redimensionar si el lado mayor excede 4096px (`resize(4096, 4096, { fit: "inside", withoutEnlargement: true })`).
     - Stripear metadata EXIF (`sharp().rotate()` para auto-rotar segun orientacion, luego eliminar metadatos).
   - Si NO es imagen (documentos, etc.): guardar sin modificaciones.
   - Guardar con extension `.webp` en lugar de la original.

3. **Configuracion de compresion por tipo de asset:**
   - `assets/uploads/` — comprimir a WebP calidad 85.
   - `assets/generated/` — no recomprimir (ya vienen del modelo en formato optimo, normalmente PNG).

4. **Registrar metadatos de compresion:**
   - Archivo `{workspaceDir}/assets/.compression-log.jsonl`:
     ```json
     {"original":"photo.jpg","compressed":"photo.webp","originalSize":4500000,"compressedSize":320000,"savedPct":92.9,"timestamp":"..."}
     ```

### Fase 5: Soporte de Range Requests

**Objetivo:** Permitir carga progresiva de imagenes grandes y seeking en video/audio.

1. **Agregar `Accept-Ranges: bytes` a respuestas de archivos > 1MB.**

2. **Parsear header `Range: bytes=0-1048575` en el handler de streaming:**
   - Usar `Bun.file(path).slice(start, end)` para streaming parcial.
   - Responder con `206 Partial Content` + `Content-Range: bytes 0-1048575/5242880`.

3. **Aplicar a todos los endpoints de assets:**
   - `GET /api/workspace/*?raw=true`
   - `GET /api/sessions/:id/files/*`
   - `GET /api/agents/:id/avatar`

### Fase 6: Consolidacion de Utilidades de Resolucion de URLs

**Objetivo:** Eliminar duplicacion y mantener un solo source of truth.

1. **Mover `resolveImageUrl()` de `ImageGrid.tsx` a `@/lib/file-urls.ts`.**

2. **Eliminar `resolveFileUrl()` de `ToolResultInspector.tsx` y migrar callers a `resolveImageUrl()`.**

3. **Agregar soporte para thumbnail en `resolveImageUrl()`:**
   ```typescript
   resolveImageUrl(url, sessionId, { project, agentId, channelId, thumbnail?: 200 | 400 | 800 })
   ```

4. **Verificar que todos los consumidores compilan:**
   - `ImageGrid.tsx`
   - `MessageBlocks.tsx`
   - `ToolCallRow.tsx`
   - `ToolResultInspector.tsx`

### Fase 7: Cache de Thumbnails en Disco y Limpieza

**Objetivo:** Gestionar el ciclo de vida de thumbnails para no acumular basura.

1. **Estructura de cache de thumbnails:**
   ```
   {data}/users/{user}/workspace/.thumbnails/
     200/
       assets/uploads/photo.webp
       assets/generated/img_123.png
     400/
       ...
     800/
       ...
   ```

2. **Generacion condicional:**
   - Si el original es mas pequeno que el ancho solicitado, servir el original sin redimensionar (evitar upscaling).
   - Si el thumbnail ya existe y el mtime del original no cambio, servir el thumbnail cacheado.

3. **Script de limpieza `bun scripts/clean-thumbnails.ts`:**
   - Recorre `.thumbnails/`, verifica que cada original exista.
   - Elimina thumbnails huerfanos.
   - Reporta espacio liberado.

4. **Endpoint `DELETE /api/workspace/thumbnail/cache`:**
   - Elimina todo el directorio `.thumbnails/` para el usuario.
   - Util para liberar espacio sin borrar originales.

### Fase 8: ImageManager Centralizado (Refactor)

**Objetivo:** Unificar toda la logica de imagenes en un solo modulo del servidor.

1. **Crear `apps/server/src/core/image-manager.ts`:**
   - `uploadImage(buffer, filename, workspaceDir): UploadResult` — comprime, valida, guarda.
   - `serveImage(c, filePath, opts?): Response` — aplica cache, thumbnail, range.
   - `deleteImage(filePath): void` — borra original + thumbnails.
   - `getMetadata(filePath): ImageMetadata` — dimensiones, tamano, formato.

2. **Migrar handlers existentes al ImageManager:**
   - `files.ts:handlePostWorkspace` → `imageManager.uploadImage()`.
   - `files.ts:GET /api/workspace/*` → `imageManager.serveImage()`.
   - `image-gen-tool.ts: saveGeneratedImage` → `imageManager.uploadImage({ compress: false })`.

3. **Agregar soporte para formatos adicionales en generacion:**
   - `generate_image` tool acepta parametro `format?: "png" | "webp" | "jpeg"` (default: png).
   - Si el modelo devuelve PNG pero se pide WebP, convertir con sharp.

---

## Resumen de Entregables

| Fase | Que cambia | Donde |
|------|-----------|-------|
| 1 | `Cache-Control`, `ETag`, `Last-Modified`, `304` en assets | `files.ts`, `agents.ts` |
| 2 | Thumbnails on-the-fly con sharp (200/400/800px) | `image-thumbnail.ts`, `files.ts`, `ImageGrid.tsx` |
| 3 | `<img>` nativo con `?token=` en vez de blob+fetch | `ImageGrid.tsx`, `AuthenticatedImage`, `useSession` |
| 4 | Compresion WebP + limite tamano + metadata stripping en upload | `files.ts`, `image-manager.ts` |
| 5 | `Range` / `Accept-Ranges` / `206 Partial Content` | `files.ts`, `cache-headers.ts` |
| 6 | Consolidar `resolveImageUrl` + thumbnail support | `file-urls.ts`, `ImageGrid`, `ToolResultInspector` |
| 7 | Cache de thumbnails en disco + limpieza | `.thumbnails/`, `clean-thumbnails.ts` |
| 8 | `ImageManager` centralizado + formatos en `generate_image` | `image-manager.ts`, `image-gen-tool.ts` |

## Metricas de Exito

- `GET /api/workspace/*?raw=true` devuelve `Cache-Control` + `ETag` y responde `304` en requests subsiguientes.
- Thumbnails de grid (400px) pesan <50KB vs originales de 2-5MB.
- `AuthenticatedImage` renderiza `<img src="...?token=...">` sin `fetch()` ni `createObjectURL`.
- Upload de imagen >50MB se rechaza con `413`.
- Imagenes subidas se convierten a WebP y se reducen >80% en tamano.
- `Range` requests funcionan en archivos >1MB.
- `resolveImageUrl` es el unico resolver de URLs de archivos en todo el frontend.
