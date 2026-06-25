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

function watcherKey(username: string, repoName: string): string {
  return `${username}:${repoName}`;
}

function resolveBuildDir(username: string, repoName: string): string | null {
  const config = loadPreviewConfig(username, repoName);
  return getBuildOutputDir(config, username, repoName);
}

function readPreviewState(username: string, repoName: string): PreviewState {
  const buildDir = resolveBuildDir(username, repoName);
  const distExists = buildDir !== null;
  const indexPath = buildDir ? resolve(buildDir, "index.html") : "";
  const indexHtmlExists = distExists && existsSync(indexPath);

  let lastBuildAt: number | null = null;
  if (indexHtmlExists) {
    try {
      lastBuildAt = statSync(indexPath).mtimeMs;
    } catch {}
  }

  const config = loadPreviewConfig(username, repoName);

  return {
    repoName,
    status: indexHtmlExists ? "ready" : "idle",
    distExists,
    indexHtmlExists,
    lastBuildAt,
    config,
  };
}

function notifyStatus(username: string, repoName: string, status: PreviewStatus, error?: string) {
  const state = readPreviewState(username, repoName);
  broadcastToUser(username, {
    type: "preview_status",
    repoName,
    status,
    distExists: state.distExists,
    indexHtmlExists: state.indexHtmlExists,
    lastBuildAt: state.lastBuildAt,
    error,
  });
}

function debouncedNotify(username: string, repoName: string) {
  const key = watcherKey(username, repoName);
  const entry = watchers.get(key);
  if (!entry) return;

  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    notifyStatus(username, repoName, "ready");
  }, 300);
}

function startPollingFallback(username: string, repoName: string) {
  const key = watcherKey(username, repoName);
  const entry = watchers.get(key);
  if (!entry) return;

  let lastMtime = Date.now();
  const indexPath = resolveBuildDir(username, repoName)
    ? resolve(resolveBuildDir(username, repoName)!, "index.html")
    : "";

  entry.pollTimer = setInterval(() => {
    try {
      if (indexPath && existsSync(indexPath)) {
        const mtime = statSync(indexPath).mtimeMs;
        if (mtime > lastMtime) {
          lastMtime = mtime;
          notifyStatus(username, repoName, "ready");
        }
      } else {
        notifyStatus(username, repoName, "idle");
      }
    } catch {}
  }, 2000);
}

export function ensureWatcher(username: string, repoName: string) {
  const key = watcherKey(username, repoName);
  if (watchers.has(key)) return;

  const buildDir = resolveBuildDir(username, repoName);
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
        debouncedNotify(username, repoName);
      }
    });
    entry.watcher = w;
  } catch {
    // fs.watch failed (Docker overlay etc.), polling fallback handles it
    startPollingFallback(username, repoName);
  }
}

export function removeWatcher(username: string, repoName: string) {
  const key = watcherKey(username, repoName);
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

export function getPreviewState(username: string, repoName: string): PreviewState {
  return readPreviewState(username, repoName);
}

export function setBuilding(username: string, repoName: string) {
  notifyStatus(username, repoName, "building");
}

export function setReady(username: string, repoName: string) {
  removeWatcher(username, repoName);
  ensureWatcher(username, repoName);
  notifyStatus(username, repoName, "ready");
}

export function setError(username: string, repoName: string, error: string) {
  notifyStatus(username, repoName, "error", error);
}
