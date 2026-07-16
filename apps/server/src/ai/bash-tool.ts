import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

export interface BashSpawnContext {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

export type BashSpawnHook = (context: BashSpawnContext) => BashSpawnContext;

export interface BashToolOptions {
  spawnHook?: BashSpawnHook;
  outputFilter?: (output: string) => string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  schema: any;
  execute: (first: any, second?: any, third?: any) => Promise<any>;
}

export function verifyCommandSafety(command: string): { safe: boolean; reason?: string } {
  const protectedPorts = [
    process.env.PORT ?? "3000",
    process.env.PREVIEW_PORT ?? "3001",
    "4104",
    "5173"
  ].map(p => parseInt(p, 10)).filter(p => !isNaN(p));

  const pid = process.pid;
  const lowerCmd = command.toLowerCase();

  // 1. Detectar si contiene palabras clave destructivas de procesos
  const killKeywords = ["kill", "taskkill", "stop-process", "fuser", "pkill", "killall"];
  const hasKillKeyword = killKeywords.some(kw => lowerCmd.includes(kw));

  if (hasKillKeyword) {
    // Buscar si contiene el PID actual como número entero aislado
    const pidRegex = new RegExp(`\\b${pid}\\b`);
    if (pidRegex.test(lowerCmd)) {
      return {
        safe: false,
        reason: `Command attempts to terminate the current server process (PID: ${pid}) which runs the agent platform.`
      };
    }

    // Buscar si contiene alguno de los puertos protegidos como número entero aislado
    for (const port of protectedPorts) {
      const portRegex = new RegExp(`\\b${port}\\b`);
      if (portRegex.test(lowerCmd)) {
        return {
          safe: false,
          reason: `Command attempts to terminate processes associated with protected infrastructure port: ${port}.`
        };
      }
    }
  }

  // 2. Protecciones heurísticas sobre comandos de red combinados con terminación/forzado
  for (const port of protectedPorts) {
    const portRegex = new RegExp(`\\b${port}\\b`);
    if (portRegex.test(lowerCmd)) {
      const networkKeywords = ["netstat", "lsof", "fuser", "get-nettcpconnection", "owningprocess"];
      const hasNetworkKeyword = networkKeywords.some(nw => lowerCmd.includes(nw));
      if (hasNetworkKeyword && (hasKillKeyword || lowerCmd.includes("stop") || lowerCmd.includes("force") || lowerCmd.includes("-k"))) {
        return {
          safe: false,
          reason: `Command matches a dangerous pattern that targets infrastructure port: ${port}.`
        };
      }
    }
  }

  return { safe: true };
}

export function createBashToolDefinition(cwd: string, options?: BashToolOptions): ToolDefinition {
  return {
    name: "bash",
    description: "Run commands in a bash shell or terminal. Use this to run builds, tests, or scripts.",
    schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The command to run" },
        timeout: { type: "number", description: "Timeout in seconds" },
      },
      required: ["command"],
    },
    execute: async (toolCallIdOrArgs: any, argsOrContext: any = {}, maybeSignal?: AbortSignal) => {
      let command: string;
      let timeout: number | undefined;
      let abortSignal: AbortSignal | undefined;

      if (typeof toolCallIdOrArgs === "string") {
        command = argsOrContext?.command;
        timeout = argsOrContext?.timeout;
        abortSignal = maybeSignal;
      } else {
        command = toolCallIdOrArgs?.command;
        timeout = toolCallIdOrArgs?.timeout;
        abortSignal = argsOrContext?.signal || argsOrContext?.abortSignal;
      }

      const safety = verifyCommandSafety(command);
      if (!safety.safe) {
        return {
          exitCode: 1,
          output: `Security Policy Error: Command execution rejected. ${safety.reason}`,
          isError: true,
        };
      }

      if (!existsSync(cwd)) {
        return {
          exitCode: 1,
          output: `Error: Working directory does not exist: ${cwd}`,
          isError: true,
        };
      }

      // Preparar shell y argumentos
      let shell = "bash";
      let shellArgs: string[] = ["-c", command];

      if (process.platform === "win32") {
        shell = "powershell.exe";
        shellArgs = ["-NoProfile", "-NonInteractive", "-Command", command];
      }

      // Preparar contexto de ejecución para el spawnHook
      let spawnContext: BashSpawnContext = {
        command: shell,
        args: shellArgs,
        cwd,
        env: { ...process.env } as Record<string, string>,
      };

      if (options?.spawnHook) {
        spawnContext = options.spawnHook(spawnContext);
      }

      return new Promise((resolve) => {
        const child = spawn(spawnContext.command, spawnContext.args, {
          cwd: spawnContext.cwd,
          env: spawnContext.env,
          windowsHide: true,
        });

        let output = "";
        let errorOutput = "";

        child.stdout.on("data", (data) => {
          output += data.toString();
        });

        child.stderr.on("data", (data) => {
          errorOutput += data.toString();
        });

        // Soporte para AbortSignal en el contexto (por ejemplo, si el agente aborta la ejecución)
        const sig = abortSignal;
        const onAbort = () => {
          try {
            child.kill();
          } catch {}
          let finalOutput = output + errorOutput + "\n[Command aborted by user]";
          if (options?.outputFilter) {
            finalOutput = options.outputFilter(finalOutput);
          }
          resolve({
            exitCode: null,
            output: finalOutput,
            cancelled: true,
          });
        };

        if (sig) {
          if (sig.aborted) {
            onAbort();
            return;
          }
          sig.addEventListener("abort", onAbort);
        }

        let timeoutHandle: NodeJS.Timeout | undefined;
        if (timeout && timeout > 0) {
          timeoutHandle = setTimeout(() => {
            try {
              child.kill();
            } catch {}
            let finalOutput = output + errorOutput + `\n[Command timed out after ${timeout} seconds]`;
            if (options?.outputFilter) {
              finalOutput = options.outputFilter(finalOutput);
            }
            resolve({
              exitCode: null,
              output: finalOutput,
              timedOut: true,
            });
          }, timeout * 1000);
        }

        child.on("close", (code) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          if (abortSignal) {
            abortSignal.removeEventListener("abort", onAbort);
          }

          let finalOutput = output + errorOutput;
          if (options?.outputFilter) {
            finalOutput = options.outputFilter(finalOutput);
          }

          resolve({
            exitCode: code,
            output: finalOutput,
            cancelled: false,
          });
        });

        child.on("error", (err) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          if (abortSignal) {
            abortSignal.removeEventListener("abort", onAbort);
          }
          resolve({
            exitCode: 1,
            output: `Failed to spawn shell process: ${err.message}`,
            isError: true,
          });
        });
      });
    },
  };
}
