import { spawn } from "node:child_process";
import { broadcastToUser } from "../ws/handler";
import { getBuildCommand } from "./preview-config";
import { type PreviewConfig, getProjectWorkspaceDir } from "shared";
import { resolveProjectDir } from "./session/workspace-resolver";
import { join } from "node:path";

const activeBuilds = new Map<string, AbortController>();

function buildKey(username: string, projectName: string): string {
  return `${username}:${projectName}`;
}

export function isBuilding(username: string, projectName: string): boolean {
  return activeBuilds.has(buildKey(username, projectName));
}

export async function runBuild(
  username: string,
  projectName: string,
  config: PreviewConfig
): Promise<{ success: boolean; exitCode: number | null }> {
  const key = buildKey(username, projectName);

  // Prevent concurrent builds
  if (activeBuilds.has(key)) {
    broadcastToUser(username, {
      type: "preview_build_log",
      projectName,
      line: "A build is already running. Please wait for it to complete.",
    });
    return { success: false, exitCode: null };
  }

  const resolved = resolveProjectDir(username, projectName);
  const projectDir = resolved ? join(resolved, "workspace") : getProjectWorkspaceDir(username, projectName);
  const command = getBuildCommand(config, username, projectName);

  if (!command) {
    broadcastToUser(username, {
      type: "preview_build_log",
      projectName,
      line: "No build command configured. Set a build command in the preview settings.",
    });
    return { success: false, exitCode: null };
  }

  const abortController = new AbortController();
  activeBuilds.set(key, abortController);

  broadcastToUser(username, {
    type: "preview_status",
    projectName,
    status: "building",
  });

  broadcastToUser(username, {
    type: "preview_build_log",
    projectName,
    line: `$ ${command}`,
  });

  return new Promise((resolve_) => {
    const proc = spawn("bash", ["-c", command], {
      cwd: projectDir,
      signal: abortController.signal,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const onData = (chunk: Buffer) => {
      const lines = chunk.toString("utf-8").split("\n").filter(Boolean);
      for (const line of lines) {
        broadcastToUser(username, {
          type: "preview_build_log",
          projectName,
          line: line.replace(/\r$/, ""),
        });
      }
    };

    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);

    proc.on("close", (exitCode) => {
      activeBuilds.delete(key);

      const success = exitCode === 0;

      broadcastToUser(username, {
        type: "preview_build_log",
        projectName,
        line: success
          ? `Build completed successfully (exit code 0)`
          : `Build failed (exit code ${exitCode})`,
      });

      broadcastToUser(username, {
        type: "preview_build_end",
        projectName,
        success,
        exitCode,
      });

      if (success) {
        broadcastToUser(username, {
          type: "preview_status",
          projectName,
          status: "ready",
        });
      } else {
        broadcastToUser(username, {
          type: "preview_status",
          projectName,
          status: "error",
          error: `Build failed with exit code ${exitCode}`,
        });
      }

      resolve_({ success, exitCode });
    });

    proc.on("error", (err) => {
      activeBuilds.delete(key);

      broadcastToUser(username, {
        type: "preview_build_log",
        projectName,
        line: `Failed to start build: ${err.message}`,
      });

      broadcastToUser(username, {
        type: "preview_build_end",
        projectName,
        success: false,
        exitCode: -1,
      });

      broadcastToUser(username, {
        type: "preview_status",
        projectName,
        status: "error",
        error: err.message,
      });

      resolve_({ success: false, exitCode: -1 });
    });
  });
}

export function abortBuild(username: string, projectName: string) {
  const key = buildKey(username, projectName);
  const controller = activeBuilds.get(key);
  if (controller) {
    controller.abort();
    activeBuilds.delete(key);

    broadcastToUser(username, {
      type: "preview_build_log",
      projectName,
      line: "Build cancelled.",
    });

    broadcastToUser(username, {
      type: "preview_status",
      projectName,
      status: "idle",
    });
  }
}
