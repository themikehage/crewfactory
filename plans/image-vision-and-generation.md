# Image Vision & Generation — Plan de Implementación

## Resumen
El stack actual tiene soporte parcial para visión (input de imágenes) e infraestructura tipada para generación (output), pero ambas están incompletas en la capa de integración con CrewFactory.

---

## Fase 1: Vision de Imagen (Input Multimodal)
**Tiempo estimado:** 2-3h

### 1.1 Exponer capacidad multimodal en AvailableModel
- **Archivo:** `apps/server/src/ai/model-registry.ts`
- Agregar campo `input?: ("text" | "image")[]` al tipo `AvailableModel`
- Propagar el campo `input` desde `ProviderConfig.models[].input` en `refresh()`
- Propagar en `getAll()`
- El regex de detección automática ya funciona en `refreshProviderModels()` (línea 192)

### 1.2 Arreglar AgentSession.prompt() para aceptar imágenes
- **Archivo:** `apps/server/src/ai/agent-session.ts`
- Modificar firma: `async prompt(messageText: string, opts?: { images?: ImageContent[], streamingBehavior?: string })`
- Cuando `opts.images` está presente, construir `userMessage.content` como `(TextContent | ImageContent)[]` en vez de `string`
- Pasar `input` del modelo al objeto `modelObj` (línea 184-197) para que el SDK sepa si el modelo soporta imágenes
- El `transform-messages.ts` del SDK ya degrada automáticamente imágenes para modelos no-vision

### 1.3 Enviar capacidad multimodal al frontend
- **Archivo:** `apps/server/src/routes/models.ts` o endpoint de providers
- Incluir `input` en la respuesta de modelos disponibles para que el frontend pueda mostrar badges "Vision"

### 1.4 (Opcional) Badge visual en selector de modelos
- **Archivos:** Componentes del cliente (ModelSelector, ProviderSettings, etc.)
- Mostrar indicador "Vision" junto a modelos que tienen `input: ["text", "image"]`

### 1.5 Testing de extremo a extremo
- Verificar que una imagen adjuntada en ChatInput llegue como base64 al modelo
- Verificar que un modelo con vision (GPT-4o, Claude 3.5 Sonnet) procese la imagen correctamente
- Verificar que un modelo sin vision degrade correctamente con placeholder

---

## Fase 2: Generación de Imagen (Output)
**Tiempo estimado:** 4-6h

### 2.1 Implementar proveedor de imagen (OpenRouter Images)
- **Archivo:** `apps/server/src/ai/vendor/ai/src/providers/openrouter-images.ts` (NO EXISTE — crearlo)
- Implementar la función `openrouterImagesProvider()` importada desde `providers/all.ts:31`
- El proveedor debe:
  - Endpoint: `https://openrouter.ai/api/v1/images/generations` (OpenAI-compatible)
  - Mapear `ImagesContext` → payload de API
  - Parsear respuesta a `AssistantImages` con `output: ImagesOutputContent[]`
  - Soportar modelos como `openai/dall-e-3`, `stability/sd3.5`, `flux`, etc.
- **Alternativa pragmática:** si el SDK de origen no tiene esta implementación, wrappear la API de OpenRouter directamente sin pasar por el sistema de `ImagesModels`, exponiéndolo como un tool simple

### 2.2 Crear tool `generate_image` para los agentes
- **Archivo:** `apps/server/src/core/tools/image-gen-tool.ts` (nuevo)
- Tool con schema:
  ```
  name: "generate_image"
  description: "Generate an image from a text prompt using AI image generation models"
  parameters: {
    prompt: string (required) - Description of the image to generate
    size?: string - "1024x1024" | "1792x1024" | "1024x1792"
    style?: string - "natural" | "vivid"
    quality?: string - "standard" | "hd"
  }
  ```
- Ejecución:
  1. Resolver API key del proveedor de imágenes
  2. Llamar a la API de generación (OpenRouter Images o directa)
  3. Descargar la imagen generada a `assets/generated/`
  4. Retornar path local + llamar a `render_images` para mostrarla en el chat
  5. Retornar `content: [{ type: "image", data: base64, mimeType: "image/png" }]` (si soporta tool result images)

### 2.3 Integrar ImageGen en el system prompt
- **Archivo:** `apps/server/src/core/prompts/system-instructions.ts`
- Agregar documentación de uso del tool `generate_image` similar a como se documenta `render_images`

### 2.4 Agregar `generate_image` a los tools preservados
- **Archivos:**
  - `apps/server/src/core/session-manager.ts` (lista similar a línea 457)
  - `apps/server/src/ws/handler.ts` (tools siempre activos, similar a línea 328)
  - `apps/server/src/core/tools/spawn-subagent-tool.ts` (línea 167)
- Incluir `generate_image` en la lista de tools que siempre se preservan

### 2.5 (Opcional) UI de selección de modelo de imagen
- Agregar modelos de generación de imagen disponibles en el endpoint de modelos
- El tool `generate_image` podría aceptar un parámetro `model` opcional

---

## Fase 3: Integración Completa con Tool Result Images
**Tiempo estimado:** 1-2h

### 3.1 Soportar ImageContent en tool results del frontend
- **Archivos:** `apps/client/src/components/chat/tools/ToolCallRow.tsx`, `ToolResultInspector.tsx`
- El SDK ya soporta que `ToolResultMessage.content` incluya `ImageContent[]`
- Verificar que tool results con imágenes se rendericen correctamente en el chat
- Si un tool (ej. `read`, `grep`) devuelve imágenes, deben mostrarse inline

### 3.2 Generación y guardado de imágenes
- **Archivo:** `apps/server/src/core/tools/image-gen-tool.ts`
- Pipeline completo:
  1. Agente llama `generate_image(prompt, size, style)`
  2. Server llama a API de generación
  3. Imagen se guarda en `assets/generated/{timestamp}_{hash}.png`
  4. Se llama internamente a la lógica de `render_images` con el path local
  5. La UI renderiza la imagen desde el workspace vía endpoint autenticado

---

## Resumen de Archivos a Modificar/Crear

### Modificar
| Archivo | Cambio |
|---------|--------|
| `apps/server/src/ai/model-registry.ts` | Agregar `input` a `AvailableModel` |
| `apps/server/src/ai/agent-session.ts` | Aceptar `images` en `prompt()`, pasar `input` al modelObj |
| `apps/server/src/core/prompts/system-instructions.ts` | Documentar tool `generate_image` |
| `apps/server/src/core/session-manager.ts` | Agregar `generate_image` a tools preservados |
| `apps/server/src/ws/handler.ts` | Agregar `generate_image` a tools siempre activos |
| `apps/server/src/core/tools/spawn-subagent-tool.ts` | Agregar `generate_image` a tools de subagentes |

### Crear
| Archivo | Propósito |
|---------|-----------|
| `apps/server/src/ai/vendor/ai/src/providers/openrouter-images.ts` | Proveedor de generación de imagen (OpenRouter) |
| `apps/server/src/core/tools/image-gen-tool.ts` | Tool `generate_image` para agentes |

### Opcional (UI)
| Archivo | Cambio |
|---------|--------|
| `apps/client/src/components/settings/ProviderInfoModal.tsx` | Mostrar modelos de imagen disponibles |
| `apps/client/src/components/chat/ModelSelector.tsx` | Badge "Vision" en modelos |

---

## Verificación
- `bun run build` desde `apps/server`
- `cd apps/client && bun run build`
- Prueba manual: subir imagen en chat con modelo vision-enabled
- Prueba manual: pedir al agente que genere una imagen con `generate_image`
