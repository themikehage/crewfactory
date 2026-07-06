import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { broadcastToUser } from "../ws/handler";
import { getBuildCommand } from "./preview-config";
import type { PreviewConfig } from "shared";

const activeBuilds = new Map<string, AbortController>();

function buildKey(username: string, repoName: string): string {
  return `${username}:${repoName}`;
}

export function isBuilding(username: string, repoName: string): boolean {
  return activeBuilds.has(buildKey(username, repoName));
}

export async function runBuild(
  username: string,
  repoName: string,
  config: PreviewConfig
): Promise<{ success: boolean; exitCode: number | null }> {
  const key = buildKey(username, repoName);

  // Prevent concurrent builds
  if (activeBuilds.has(key)) {
    broadcastToUser(username, {
      type: "preview_build_log",
      repoName,
      line: "A build is already running. Please wait for it to complete.",
    });
    return { success: false, exitCode: null };
  }

  const repoDir = resolve(`/tmp/crewfactory/${username}/repos/${repoName}/workspace`);
  const command = getBuildCommand(config, username, repoName);

  if (!command) {
    broadcastToUser(username, {
      type: "preview_build_log",
      repoName,
      line: "No build command configured. Set a build command in the preview settings.",
    });
    return { success: false, exitCode: null };
  }

  const abortController = new AbortController();
  activeBuilds.set(key, abortController);

  broadcastToUser(username, {
    type: "preview_status",
    repoName,
    status: "building",
  });

  broadcastToUser(username, {
    type: "preview_build_log",
    repoName,
    line: `$ ${command}`,
  });

  return new Promise((resolve_) => {
    const proc = spawn("bash", ["-c", command], {
      cwd: repoDir,
      signal: abortController.signal,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const onData = (chunk: Buffer) => {
      const lines = chunk.toString("utf-8").split("\n").filter(Boolean);
      for (const line of lines) {
        broadcastToUser(username, {
          type: "preview_build_log",
          repoName,
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
        repoName,
        line: success
          ? `Build completed successfully (exit code 0)`
          : `Build failed (exit code ${exitCode})`,
      });

      broadcastToUser(username, {
        type: "preview_build_end",
        repoName,
        success,
        exitCode,
      });

      if (success) {
        broadcastToUser(username, {
          type: "preview_status",
          repoName,
          status: "ready",
        });
      } else {
        broadcastToUser(username, {
          type: "preview_status",
          repoName,
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
        repoName,
        line: `Failed to start build: ${err.message}`,
      });

      broadcastToUser(username, {
        type: "preview_build_end",
        repoName,
        success: false,
        exitCode: -1,
      });

      broadcastToUser(username, {
        type: "preview_status",
        repoName,
        status: "error",
        error: err.message,
      });

      resolve_({ success: false, exitCode: -1 });
    });
  });
}

export function abortBuild(username: string, repoName: string) {
  const key = buildKey(username, repoName);
  const controller = activeBuilds.get(key);
  if (controller) {
    controller.abort();
    activeBuilds.delete(key);

    broadcastToUser(username, {
      type: "preview_build_log",
      repoName,
      line: "Build cancelled.",
    });

    broadcastToUser(username, {
      type: "preview_status",
      repoName,
      status: "idle",
    });
  }
}
