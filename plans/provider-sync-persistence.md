# Provider: Auto-Sync & Persistencia de Modelos Dinámicos

## Problemas

### 1. Al añadir API key no se sincronizan modelos dinámicos

En `apps/server/src/routes/providers.ts:83-99`, el handler `POST /:id/key` hace:

```typescript
authStorage.set(providerId, { type: "api_key", key: apiKey });
modelRegistry.refresh();
```

`refresh()` solo reconstruye `available[]` desde `config.models` en memoria. Para proveedores con `dynamic: true` (qwen, opencode-go), esos models son los defaults hardcodeados (6-8 modelos), no los reales del API. El usuario tiene que hacer clic manual en "Sync" para que `refreshProviderModels()` haga `GET {baseUrl}/models`.

### 2. Modelos sincronizados no persisten al reiniciar

Al reiniciar el server, `getUserContext()` crea un `ModelRegistry` nuevo y los `register*Provider()` cargan los defaults hardcodeados. Si el usuario ya había sincronizado modelos (ej: Qwen devolvió modelos distintos a los hardcodeados), esos se pierden.

---

## Solución

### Fix 1: Auto-sync al guardar API key

En `POST /:id/key` en `providers.ts`, si el provider tiene `dynamic: true`, llamar `refreshProviderModels()` además de `refresh()`:

```
POST /:id/key:
  1. authStorage.set(providerId, apiKey)
  2. modelRegistry.refresh()
  3. Si provider es dynamic:
       modelRegistry.refreshProviderModels(providerId)  // fetch remoto
       persistir modelos a disco
  4. authStorage.saveModels(providerId, models)          // persistir
```

Lo mismo aplica para `DELETE /:id/key` — limpiar modelos persistidos.

### Fix 2: Persistir modelos dinámicos a disco

Estrategia: guardar los modelos devueltos por `refreshProviderModels()` en un archivo por usuario, y cargarlos al registrar el provider en startup.

#### Archivo

- Ruta: `/tmp/crewfactory/{username}/provider-models.json`
- Formato: `Record<string, ModelDef[]>` keyeado por provider name

Agregar `getProviderModelsPath(username)` en `packages/shared/src/paths.ts`.

#### Persistir (save)

Crear método en `UserConfigManager` o directamente en `ModelRegistry`:

```typescript
saveProviderModels(username: string, provider: string, models: ModelDef[]): void
```

Llamarlo después de `refreshProviderModels()` exitoso.

#### Cargar (load)

Crear método para leer del disco:

```typescript
loadProviderModels(username: string, provider: string): ModelDef[] | null
```

#### Integrar en startup

En `registerQwenProvider()` y `registerOpenCodeGoProvider()` en `user-config.ts`:

1. Primero intentar cargar modelos persistidos desde disco
2. Si existen, usarlos en lugar de los defaults hardcodeados
3. Si no existen (primera vez), usar defaults

```typescript
// user-config.ts getUserContext()
registerQwenProvider(modelRegistry, username);  // pasar username
registerOpenCodeGoProvider(modelRegistry, username);
```

Y en cada `register*Provider()`:

```typescript
export function registerQwenProvider(registry: ModelRegistry, username: string) {
  const persisted = loadProviderModels(username, "qwen");
  registry.registerProvider("qwen", {
    ...baseConfig,
    models: persisted ?? DEFAULT_QWEN_MODELS,
  });
}
```

---

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `packages/shared/src/paths.ts` | Agregar `getProviderModelsPath()` |
| `apps/server/src/routes/providers.ts` | Auto-sync + persistir en `POST /:id/key`; limpiar en `DELETE /:id/key` |
| `apps/server/src/core/session/user-config.ts` | Pasar `username` a `register*Provider()`; cargar modelos persistidos |
| `apps/server/src/core/providers/qwen-provider.ts` | Aceptar `username`, cargar modelos persistidos |
| `apps/server/src/core/providers/opencode-go-provider.ts` | Idem |
| `apps/server/src/ai/model-registry.ts` | Opcional: método helper `isDynamic(provider)` |

---

## Consideraciones

- No encriptar el archivo `provider-models.json` (no contiene secrets, solo IDs/nombres de modelos)
- Los defaults hardcodeados funcionan como fallback: si no hay archivo persistido o hay error de lectura, se usan los defaults
- No tocar providers NO dinámicos (openai, anthropic, etc.) — sus modelos son fijos
