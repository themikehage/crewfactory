export type PermissionVerdict =
  | { allow: true }
  | { allow: false; reason: string }
  | { allow: "ask"; reason: string };

export interface PermissionRule {
  tool: string;           // "bash" | "write" | "read" | "edit" | "*"
  pattern?: RegExp;       // Regex sobre el string del argumento clave
  allow: boolean | "ask";
  reason: string;
}

// DENY-FIRST: Solo bloquea lo que es inequívocamente destructivo
const DENY_RULES: PermissionRule[] = [
  // rm -rf sobre rutas críticas del sistema (ej: /etc, /usr, /var, etc. pero permitiendo en /tmp y /workspace)
  {
    tool: "bash",
    pattern: /\brm\s+-[rRfF]{1,4}\s+(\/(?!tmp|workspace)[a-zA-Z0-9_\-*]+)/,
    allow: false,
    reason: "Recursive deletion of critical system directories is blocked."
  },
  // Fork bomb explícita
  {
    tool: "bash",
    pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    allow: false,
    reason: "Fork bomb patterns are blocked."
  },
  // Acceso directo a claves SSH, passwords del sistema, etc.
  {
    tool: "read",
    pattern: /(\bssh\b|\.ssh\b|\bpasswd\b|\bshadow\b|\bcredentials\b|\bsecrets\b)/i,
    allow: false,
    reason: "Access to system credentials or sensitive keys is blocked."
  },
  {
    tool: "bash",
    pattern: /(cat|less|more|grep|find)\s+.*(\.ssh\/|passwd|shadow)/i,
    allow: false,
    reason: "Inspecting system credential files is blocked."
  },
  // curl-pipe-bash o wget-pipe-bash (ejecución remota directa no verificada)
  {
    tool: "bash",
    pattern: /\b(curl|wget)\b[^|]*\|\s*(ba)?sh\b/,
    allow: false,
    reason: "Piping remote network scripts directly into a shell execution is blocked."
  },
  // mkfs / dd sobre discos o particiones directamente
  {
    tool: "bash",
    pattern: /\b(mkfs|dd\b.*\/dev\/(sd|nvme|vd))/,
    allow: false,
    reason: "Disk formatting or direct writing to raw devices is blocked."
  },
];

// ASK: Operaciones potencialmente peligrosas pero que pueden ser legítimas
const ASK_RULES: PermissionRule[] = [
  // Cualquier rm -rf recursivo en general (incluso si es en el workspace)
  {
    tool: "bash",
    pattern: /\brm\s+-[rRfF]{1,4}/,
    allow: "ask",
    reason: "Recursive directory deletion requires explicit user confirmation."
  },
  // Escritura o modificación fuera de paths temporales o del workspace de crewfactory
  {
    tool: "write",
    pattern: /^(?!\/tmp|C:\\Users\\[^\\]+\\AppData\\Local\\Temp|.*[\\/]workspace[\\/]|.*[\\/]projects[\\/]).*$/i,
    allow: "ask",
    reason: "Writing file content outside workspace/temp directories requires confirmation."
  },
  {
    tool: "edit",
    pattern: /^(?!\/tmp|C:\\Users\\[^\\]+\\AppData\\Local\\Temp|.*[\\/]workspace[\\/]|.*[\\/]projects[\\/]).*$/i,
    allow: "ask",
    reason: "Editing file content outside workspace/temp directories requires confirmation."
  },
  // Modificación recursiva de permisos o propiedad
  {
    tool: "bash",
    pattern: /\b(chmod|chown)\b.*-R/,
    allow: "ask",
    reason: "Recursive permission or ownership modification requires confirmation."
  },
];

const SUBAGENT_DENY_RULES: PermissionRule[] = [
  {
    tool: "bash",
    pattern: /\brm\s+-[rRfF]{1,4}\s+(\/(etc|var|usr|home|tmp\/crewfactory))/,
    allow: false,
    reason: "Subagent: deletion of critical system or workspace root directories is blocked."
  },
  {
    tool: "bash",
    pattern: /\b(curl|wget)\b[^|]*\|\s*(ba)?sh\b/,
    allow: false,
    reason: "Subagent: piping remote network scripts directly into a shell execution is blocked."
  },
  {
    tool: "write",
    pattern: /\.env(\..+)?$/i,
    allow: false,
    reason: "Subagent: modification of environment files is blocked."
  },
  {
    tool: "edit",
    pattern: /\.env(\..+)?$/i,
    allow: false,
    reason: "Subagent: modification of environment files is blocked."
  }
];

export class PermissionEngine {
  evaluate(toolName: string, args: Record<string, unknown>, options?: { isSubagent?: boolean }): PermissionVerdict {
    const subject = this.extractSubject(toolName, args);

    // 1. Evaluar reglas DENY
    const denyRules = options?.isSubagent
      ? [...DENY_RULES, ...SUBAGENT_DENY_RULES]
      : DENY_RULES;

    for (const rule of denyRules) {
      if (this.matches(rule, toolName, subject)) {
        return { allow: false, reason: rule.reason };
      }
    }

    // 2. Evaluar reglas ASK
    for (const rule of ASK_RULES) {
      if (this.matches(rule, toolName, subject)) {
        return { allow: "ask", reason: rule.reason };
      }
    }

    return { allow: true };
  }

  private extractSubject(toolName: string, args: Record<string, unknown>): string {
    if (!args || typeof args !== "object") return "";
    if (toolName === "bash") return String(args.command ?? "");
    if (toolName === "write" || toolName === "read" || toolName === "edit") return String(args.path ?? "");
    return JSON.stringify(args);
  }

  private matches(rule: PermissionRule, toolName: string, subject: string): boolean {
    if (rule.tool !== "*" && rule.tool !== toolName) return false;
    if (rule.pattern && !rule.pattern.test(subject)) return false;
    return true;
  }
}

export const permissionEngine = new PermissionEngine();
