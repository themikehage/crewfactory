COMPLETED ✅

# OpenCode Go como Provider en CrewFactory

## Motivacion

OpenCode Go ofrece un modelo de suscripción plano a bajo costo para acceder a modelos optimizados para codificación como DeepSeek, GLM, Kimi y MiniMax. Integrarlo como un proveedor nativo en el backend de CrewFactory permite a los usuarios configurar su clave API única de OpenCode y seleccionar estos modelos optimizados desde el selector del chat.

## Enfoque Tecnico

La API de OpenCode Go es OpenAI-compatible y está alojada en el endpoint global de OpenCode. Se implementará registrando el proveedor en el `ModelRegistry` local del servidor.

## Modelos a Registrar

Basado en el catálogo oficial de OpenCode Go:

| Model ID | Nombre | Contexto | Max Tokens | Razonamiento | Vision |
|---|---|---|---|---|---|
| `deepseek-v4-pro` | DeepSeek V4 Pro | 128K | si | si |
| `deepseek-v4-flash` | DeepSeek V4 Flash | 128K | no | si |
| `glm-5.2` | GLM 5.2 | 128K | si | no |
| `minimax-m3` | MiniMax M3 | 128K | no | no |
| `kimi-k2.7` | Kimi K2.7 Code | 128K | si | no |
| `qwen3.7-max` | Qwen 3.7 Max | 128K | si | si |

## Archivos a Crear / Modificar

### 1. `apps/server/src/pi/opencode-go-provider.ts` (NUEVO)

Definición y registro del proveedor `opencode-go` con:
- `baseUrl`: `"https://opencode.ai/zen/go/v1"`
- `apiKey`: `"$OPENCODE_API_KEY"` (variable de entorno por defecto, configurable vía UI).
- `api`: `"openai-completions"` (compatible con el formato OpenAI nativo).
- Lista de modelos con sus configuraciones de contexto, tokens y compatibilidad.

### 2. `apps/server/src/pi/session-manager.ts`

Importar y ejecutar `registerOpenCodeGoProvider(modelRegistry)` dentro de la función `getUserContext()` después de refrescar el registro de modelos.

### 3. `about.md` y `steps.md`

Actualizar el listado de características del proveedor en la documentación de arquitectura y registrar la fase en la lista de pasos del proyecto.

## Plan de Verificacion

1. Verificar que el servidor compile limpiamente (`bun run build`).
2. Chequear que `opencode-go` aparezca en la lista devuelta por `/api/providers`.
3. Validar que la UI renderice la opción en Settings -> Proveedores.
