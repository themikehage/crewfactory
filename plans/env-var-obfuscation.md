# Ofuscación de Environment Variables

**Fecha:** 2026-07-01
**Problema:** Las env vars del usuario se guardan en texto plano en `env.json` y se inyectan directamente en el subprocess de cada comando bash del agente. Cualquier comando que las imprima (`echo $KEY`, `env`, `printenv`) las muestra en la terminal y quedan persistidas en el historial de la sesión.

## Estado Actual

```
Disco:  /tmp/crewfactory/{user}/env.json  →  { "GITHUB_TOKEN": "ghp_xxx", ... }  (texto plano)
          /tmp/crewfactory/{user}/auth.json →  { "anthropic": { "key": "sk-..." } } (texto plano)

Bash:    spawnHook → process.env = { ...userEnv, TOKEN, JWT_TOKEN }
         ↑ todas las secrets se inyectan en cada comando

Agente:  $ echo $GITHUB_TOKEN             →  "ghp_xxx"  (se ve en el chat)
         $ curl -H "Authorization: Bearer $GITHUB_TOKEN" ...
         → el token se USA (bien) pero también se podría LEAKEAR (mal)

API:     GET /api/env?reveal=true         →  devuelve todos los valores en crudo
         factory-env skill lo usa con $TOKEN

UI:      Settings > Env → masked (••••••••), pero el agente lo ve via bash/API
```

## Solución: Tres Capas de Protección

```
┌──────────────────────────────────────────────────────┐
│ 1. Cifrado en reposo                                 │
│    env.json → AES-256-GCM → env.json.enc             │
│    auth.json → AES-256-GCM → auth.json.enc           │
│    Clave derivada de JWT_SECRET + salt fijo           │
├──────────────────────────────────────────────────────┤
│ 2. Filtrado de output bash                           │
│    spawnHook → inyecta env vars (para que funcione)   │
│    post-process → stdout/stderr scan + replace        │
│    Cada valor conocido de secret → ***hidden***        │
├──────────────────────────────────────────────────────┤
│ 3. API con auditoría                                 │
│    ?reveal=true eliminado → solo /api/env/reveal/:key │
│    Log de acceso: quién, cuándo, qué variable         │
│    factory-env skill actualizada                      │
└──────────────────────────────────────────────────────┘
```

---

### Capa 1: Cifrado en Reposo

**Archivo:** `apps/server/src/lib/env-crypto.ts` (nuevo)

```typescript
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const SALT = "crewfactory-env-salt-v1";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function deriveKey(secret: string): Buffer {
  return createHash("sha256")
    .update(secret + SALT)
    .digest();
}

export function encryptEnv(plaintext: string, jwtSecret: string): string {
  const key = deriveKey(jwtSecret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${tag}:${encrypted}`;
}

export function decryptEnv(ciphertext: string, jwtSecret: string): string {
  const key = deriveKey(jwtSecret);
  const [ivHex, tagHex, encrypted] = ciphertext.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
```

**Integración en `session-manager.ts`:**

```typescript
// En lugar de leer/escribir JSON directamente:
private readEnvFile(username: string): Record<string, string> {
  const envPath = join(this.getUserDir(username), "env.json");
  if (!existsSync(envPath)) return {};
  const raw = readFileSync(envPath, "utf-8");
  try {
    const decrypted = decryptEnv(raw, process.env.JWT_SECRET!);
    return JSON.parse(decrypted);
  } catch {
    // Si falla decrypt, asumir archivo legacy sin cifrar
    console.warn("env.json not encrypted, migrating...");
    this.migrateAndEncryptEnv(username, raw);
    return JSON.parse(raw);
  }
}

private writeEnvFile(username: string, env: Record<string, string>): void {
  const envPath = join(this.getUserDir(username), "env.json");
  const encrypted = encryptEnv(JSON.stringify(env), process.env.JWT_SECRET!);
  writeFileSync(envPath, encrypted, "utf-8");
}
```

**Migración automática:** La primera lectura de un `env.json` legacy lo migra a formato cifrado.

**Mismo esquema para `auth.json`:**

```typescript
private readAuthFile(username: string): AuthData {
  const authPath = join(this.getUserDir(username), "auth.json");
  if (!existsSync(authPath)) return {};
  const raw = readFileSync(authPath, "utf-8");
  try {
    const decrypted = decryptEnv(raw, process.env.JWT_SECRET!);
    return JSON.parse(decrypted);
  } catch {
    // Legacy fallback
    this.migrateAndEncryptAuth(username, raw);
    return JSON.parse(raw);
  }
}
```

**Al hacer backup (export):** El export ya incluye `env.json` cifrado. El import lo recibe cifrado y lo escribe tal cual. No hay cambio en backup.

---

### Capa 2: Filtrado de Output Bash

**Archivo:** `apps/server/src/core/bash-output-filter.ts` (nuevo)

```typescript
export function filterSecretsFromOutput(
  output: string,
  secrets: string[],
): string {
  if (!secrets.length) return output;

  // Ordenar de más larga a más corta para evitar reemplazos parciales
  const sorted = [...secrets].sort((a, b) => b.length - a.length);

  let filtered = output;
  for (const secret of sorted) {
    // Escapar caracteres especiales para regex
    const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filtered = filtered.replace(new RegExp(escaped, "g"), "***hidden***");
  }
  return filtered;
}
```

**Integración en `session-manager.ts`** (dentro del `spawnHook` o post-proceso del bash tool):

El bash tool del pi-coding-agent SDK probablemente tiene un callback de output. Si no, podemos modificar el `spawnHook` o crear un wrapper:

```typescript
const customBashTool = createBashToolDefinition(workspaceDir, {
  spawnHook: (context) => {
    const userEnv = this.getUserEnv(username);
    const token = jwt.sign({ username }, process.env.JWT_SECRET!, { expiresIn: "7d" });
    return {
      ...context,
      env: { ...context.env, ...userEnv, TOKEN: token, JWT_TOKEN: token },
    };
  },
  // Hook que se ejecuta sobre el output antes de devolverlo al agente
  outputFilter: (output: string) => {
    const userEnv = this.getUserEnv(username);
    const secrets = Object.values(userEnv).filter(Boolean);
    return filterSecretsFromOutput(output, secrets);
  },
});
```

Si el SDK no expone `outputFilter`, se puede hacer un wrapper:

```typescript
// Wrapper que intercepta y filtra
const originalOnToolResult = session.onToolResult;
session.onToolResult = (result) => {
  if (result.tool === "bash") {
    result.output = filterSecretsFromOutput(result.output, allSecrets);
  }
  return originalOnToolResult(result);
};
```

**Consideraciones:**

| Situación | ¿Filtra? | Ejemplo |
|---|---|---|
| `echo $GITHUB_TOKEN` | ✅ `ghp_xxx` → `***hidden***` |
| `env` | ✅ líneas con secrets → `***hidden***` |
| `curl -H "Authorization: Bearer $TOKEN"` | ❌ No filtra (token no está en output, está en respuesta HTTP) | Correcto, la respuesta HTTP no contiene el token |
| `echo ${GITHUB_TOKEN:0:10}` | ❌ Filtrado parcial no se detecta | Riesgo asumido (el agente tendría que explicitly truncar) |
| `echo $GITHUB_TOKEN \| base64` | ❌ Ofuscación en base64 no se detecta | Riesgo asumido (requiere intención explícita) |
| Output muy grande (>1MB) | ⚠️ Se escanea completo | Puede añadir latencia. Optimizar: solo scan si output contiene algo del tamaño de un secret |

**Optimización:** Solo escanear si el output contiene cadenas de longitud >= la del secret más corto. Pre-filtrar con un bloom filter para evitar O(n*m) en outputs grandes.

---

### Capa 3: API Restringida con Auditoría

**Archivo:** `apps/server/src/routes/env.ts` (modificado)

**Cambios:**

```typescript
// ELIMINAR: GET /api/env?reveal=true  (revelado masivo)
// AÑADIR:   GET /api/env/reveal/:key  (revelado individual con log)

envRouter.get("/reveal/:key", authMiddleware, async (c) => {
  const { username } = getAuthPayload(c);
  const key = c.req.param("key");

  const env = piSessionManager.getUserEnv(username);
  if (!(key in env)) {
    return c.json({ error: "Variable not found" }, 404);
  }

  // Auditar acceso
  auditLog(username, "env_reveal", { key, timestamp: new Date().toISOString() });

  return c.json({ key, value: env[key] });
});

// Mantener GET /api/env (sin ?reveal=true, siempre masked)
envRouter.get("/", authMiddleware, async (c) => {
  const { username } = getAuthPayload(c);
  const env = piSessionManager.getUserEnv(username);
  const envList = Object.entries(env).map(([key]) => ({
    key,
    value: "••••••••",
  }));
  return c.json(envList);
});
```

**Auditoría:**

```typescript
// apps/server/src/core/audit-log.ts
const AUDIT_DIR = "/tmp/crewfactory/_audit";

export function auditLog(
  username: string,
  action: string,
  details: Record<string, unknown>,
): void {
  const logDir = join(AUDIT_DIR, username);
  mkdirSync(logDir, { recursive: true });
  const entry = {
    action,
    ...details,
    timestamp: new Date().toISOString(),
  };
  appendFileSync(
    join(logDir, "env-access.log"),
    JSON.stringify(entry) + "\n",
  );
}
```

**Actualización de `factory-env` skill (default-factory-skills.ts):**

```diff
- curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/env?reveal=true
+ # Listar variables (valores ocultos)
+ curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/env
+ # Revelar una variable específica
+ curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/env/reveal/GITHUB_TOKEN
```

---

### Cambios en Archivos

| Archivo | Cambio |
|---|---|
| `apps/server/src/lib/env-crypto.ts` | **NUEVO** — AES-256-GCM encrypt/decrypt |
| `apps/server/src/core/bash-output-filter.ts` | **NUEVO** — `filterSecretsFromOutput()` |
| `apps/server/src/core/audit-log.ts` | **NUEVO** — `auditLog()` helper |
| `apps/server/src/core/session-manager.ts` | `readEnvFile`/`writeEnvFile` con encrypt; integrar output filter en bash tool |
| `apps/server/src/routes/env.ts` | Eliminar `?reveal=true`, añadir `GET /api/env/reveal/:key` |
| `apps/server/src/core/default-factory-skills.ts` | Actualizar `factory-env` skill para usar `/reveal/:key` |
| `apps/server/src/routes/providers.ts` | Cifrar `auth.json` con mismo esquema |
| `apps/client/src/pages/SettingsPage.tsx` | Developer View: reemplazar "Reveal Secrets" bulk por reveal individual |

### No Cambia

- Backup/restore — los archivos cifrados se exportan/importan tal cual
- `integrations.json` — no contiene secrets (solo template definitions, no values)
- `credentials.json` — ya está hasheado (bcrypt), no necesita cipher

### Riesgos y Mitigaciones

| Riesgo | Mitigación |
|---|---|
| JWT_SECRET rotado → env.json ilegible | En `decryptEnv`, catch error y mostrar mensaje claro. El usuario debe re-ingresar sus env vars. |
| Output filter falso positivo (reemplaza texto que parece secret pero no lo es) | Usar únicamente valores exactos de env vars, no patrones. El falso positivo solo oculta texto, no rompe nada. |
| Output filter en outputs grandes (>1MB) | Limitar scan a primeros 100KB + últimos 100KB. Si hay match, escanear completo. |
| Agente obtiene secret por truncación (`${VAR:0:10}`) | Riesgo aceptado. Requiere intención explícita del agente. Se puede mitigar con un tool `resolve_env` dedicado. |
| Agente obtiene secret por encoding (`base64`, `xxd`) | Riesgo aceptado. Requiere múltiples pasos intencionales. |
| Performance del scan en cada bash output | Secrets típicamente <10 valores. Reemplazo con string.includes() es O(n*m) pero con n pequeño. |
