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
}

export interface ToolDefinition {
  name: string;
  description: string;
  schema: any;
  execute: (args: { command: string; timeout?: number }, context?: any) => Promise<any>;
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
    execute: async (args, context: any = {}) => {
      const { command, timeout } = args;

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
        const abortSignal = context?.signal || context?.abortSignal;
        const onAbort = () => {
          try {
            child.kill();
          } catch {}
          resolve({
            exitCode: null,
            output: output + errorOutput + "\n[Command aborted by user]",
            cancelled: true,
          });
        };

        if (abortSignal) {
          if (abortSignal.aborted) {
            onAbort();
            return;
          }
          abortSignal.addEventListener("abort", onAbort);
        }

        let timeoutHandle: NodeJS.Timeout | undefined;
        if (timeout && timeout > 0) {
          timeoutHandle = setTimeout(() => {
            try {
              child.kill();
            } catch {}
            resolve({
              exitCode: null,
              output: output + errorOutput + `\n[Command timed out after ${timeout} seconds]`,
              timedOut: true,
            });
          }, timeout * 1000);
        }

        child.on("close", (code) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          if (abortSignal) {
            abortSignal.removeEventListener("abort", onAbort);
          }

          resolve({
            exitCode: code,
            output: output + errorOutput,
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
