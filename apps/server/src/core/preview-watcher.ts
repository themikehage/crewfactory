import { watch, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { FSWatcher } from "node:fs";
import { broadcastToUser } from "../ws/handler";
import type { PreviewState, PreviewStatus } from "shared";
import { loadPreviewConfig, getBuildOutputDir } from "./preview-config";

interface WatcherEntry {
  watcher: FSWatcher | null;
  timer: ReturnType<typeof setTimeout> | null;
  pollTimer: ReturnType<typeof setInterval> | null;
}

const watchers = new Map<string, WatcherEntry>();

function watcherKey(username: string, projectName: string): string {
  return `${username}:${projectName}`;
}

function resolveBuildDir(username: string, projectName: string): string | null {
  const config = loadPreviewConfig(username, projectName);
  return getBuildOutputDir(config, username, projectName);
}

function readPreviewState(username: string, projectName: string): PreviewState {
  const buildDir = resolveBuildDir(username, projectName);
  const distExists = buildDir !== null;
  const indexPath = buildDir ? resolve(buildDir, "index.html") : "";
  const indexHtmlExists = distExists && existsSync(indexPath);

  let lastBuildAt: number | null = null;
  if (indexHtmlExists) {
    try {
      lastBuildAt = statSync(indexPath).mtimeMs;
    } catch {}
  }

  const config = loadPreviewConfig(username, projectName);

  return {
    projectName,
    status: indexHtmlExists ? "ready" : "idle",
    distExists,
    indexHtmlExists,
    lastBuildAt,
    config,
  };
}

function notifyStatus(username: string, projectName: string, status: PreviewStatus, error?: string) {
  const state = readPreviewState(username, projectName);
  broadcastToUser(username, {
    type: "preview_status",
    projectName,
    status,
    distExists: state.distExists,
    indexHtmlExists: state.indexHtmlExists,
    lastBuildAt: state.lastBuildAt,
    error,
  });
}

function debouncedNotify(username: string, projectName: string) {
  const key = watcherKey(username, projectName);
  const entry = watchers.get(key);
  if (!entry) return;

  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    notifyStatus(username, projectName, "ready");
  }, 300);
}

function startPollingFallback(username: string, projectName: string) {
  const key = watcherKey(username, projectName);
  const entry = watchers.get(key);
  if (!entry) return;

  let lastMtime = Date.now();
  const indexPath = resolveBuildDir(username, projectName)
    ? resolve(resolveBuildDir(username, projectName)!, "index.html")
    : "";

  entry.pollTimer = setInterval(() => {
    try {
      if (indexPath && existsSync(indexPath)) {
        const mtime = statSync(indexPath).mtimeMs;
        if (mtime > lastMtime) {
          lastMtime = mtime;
          notifyStatus(username, projectName, "ready");
        }
      } else {
        notifyStatus(username, projectName, "idle");
      }
    } catch {}
  }, 2000);
}

export function ensureWatcher(username: string, projectName: string) {
  const key = watcherKey(username, projectName);
  if (watchers.has(key)) return;

  const buildDir = resolveBuildDir(username, projectName);
  const entry: WatcherEntry = { watcher: null, timer: null, pollTimer: null };
  watchers.set(key, entry);

  if (!buildDir) return;

  // Try fs.watch first, fall back to polling
  try {
    const w = watch(buildDir, { recursive: true }, (eventType, filename) => {
      if (!filename) return;

      const name = filename.toString();
      if (
        name.endsWith(".html") ||
        name.endsWith(".js") ||
        name.endsWith(".css") ||
        name.endsWith(".json") ||
        name === "index.html"
      ) {
        debouncedNotify(username, projectName);
      }
    });
    entry.watcher = w;
  } catch {
    // fs.watch failed (Docker overlay etc.), polling fallback handles it
    startPollingFallback(username, projectName);
  }
}

export function removeWatcher(username: string, projectName: string) {
  const key = watcherKey(username, projectName);
  const entry = watchers.get(key);
  if (entry) {
    if (entry.timer) clearTimeout(entry.timer);
    if (entry.pollTimer) clearInterval(entry.pollTimer);
    if (entry.watcher) {
      try { entry.watcher.close(); } catch {}
    }
    watchers.delete(key);
  }
}

export function getPreviewState(username: string, projectName: string): PreviewState {
  return readPreviewState(username, projectName);
}

export function setBuilding(username: string, projectName: string) {
  notifyStatus(username, projectName, "building");
}

export function setReady(username: string, projectName: string) {
  removeWatcher(username, projectName);
  ensureWatcher(username, projectName);
  notifyStatus(username, projectName, "ready");
}

export function setError(username: string, projectName: string, error: string) {
  notifyStatus(username, projectName, "error", error);
}
