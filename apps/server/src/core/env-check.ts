import { spawnSync } from "node:child_process";
import { platform, arch, release, tmpdir, homedir } from "node:os";

export interface RuntimeEnvironment {
  os: string;
  osRelease: string;
  shell: string;
  arch: string;
  bunVersion: string | null;
  nodeVersion: string;
  availableTools: string[];
  tempPath: string;
  homePath: string;
}

let cachedEnv: RuntimeEnvironment | null = null;

/**
 * Detects the runtime environment of the server.
 * The static properties are cached to avoid repeated process spawns.
 */
export function detectEnvironment(): RuntimeEnvironment {
  if (cachedEnv) return cachedEnv;

  const isWin = platform() === "win32";
  const osName = isWin ? "Windows" : platform() === "darwin" ? "macOS" : platform() === "linux" ? "Linux" : platform();
  
  const shell = isWin ? "PowerShell (powershell.exe)" : "Bash (bash)";

  // Detect versions
  const bunVersion = (process.versions as any).bun || null;
  const nodeVersion = process.version;

  // Detect tools
  const toolsToCheck = ["git", "docker", "python", "python3", "curl", "jq", "ffmpeg", "pnpm", "bun", "node", "npm"];
  const availableTools: string[] = [];

  const cmd = isWin ? "where" : "which";
  for (const tool of toolsToCheck) {
    try {
      const res = spawnSync(cmd, [tool], { timeout: 1000, encoding: "utf8" });
      if (res.status === 0) {
        availableTools.push(tool);
      }
    } catch {
      // Ignore errors
    }
  }

  cachedEnv = {
    os: osName,
    osRelease: release(),
    shell,
    arch: arch(),
    bunVersion,
    nodeVersion,
    availableTools,
    tempPath: tmpdir(),
    homePath: homedir(),
  };

  return cachedEnv;
}

/**
 * Formats the detected environment into a prompt context block,
 * including environment-aware command hints.
 */
export function getEnvironmentContext(workspacePath: string): string {
  const env = detectEnvironment();
  const toolsStr = env.availableTools.length > 0 ? env.availableTools.join(", ") : "None detected";
  
  let hints = "";
  if (env.os === "Windows") {
    hints = 
      `- Use PowerShell-compatible commands. For inline python code, use: python -c "..."\n` +
      `- Avoid Linux heredocs (<< EOF) as they are NOT supported in PowerShell. Use multi-line string assignments or file writes instead.\n` +
      `- Do not use Linux-specific command utilities like 'cat', 'grep', 'sed', 'awk', etc. unless they are explicitly known to be installed or you use PowerShell equivalents.\n` +
      `- The 'curl' command on Windows PowerShell is an alias to Invoke-WebRequest which has different parameters. Avoid curl; use Python urllib/requests or Invoke-RestMethod for HTTP requests.\n` +
      `- If outputting unicode/UTF-8 characters in Python, make sure to set: sys.stdout.reconfigure(encoding='utf-8') before printing.`;
  } else {
    hints =
      `- You are in a Unix-like environment. Standard Bash utilities (grep, sed, awk, cat, curl) are fully supported.\n` +
      `- Heredocs (<< EOF) are supported for writing multi-line content to files.`;
  }

  return `Runtime Environment:
- OS: ${env.os} (Release: ${env.osRelease}, Arch: ${env.arch})
- Shell: ${env.shell}
- Runtime: Bun ${env.bunVersion || "N/A"}, Node ${env.nodeVersion}
- Available tools: ${toolsStr}
- Workspace: ${workspacePath}
- Temp Dir: ${env.tempPath}
- Home Dir: ${env.homePath}

Command hints for this environment:
${hints}`;
}
