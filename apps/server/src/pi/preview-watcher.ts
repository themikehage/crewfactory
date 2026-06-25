import { watch, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { FSWatcher } from "node:fs";
import { broadcastToUser } from "../ws/handler";
import type { PreviewState, PreviewStatus } from "shared";

interface WatcherEntry {
  watcher: FSWatcher;
  timer: ReturnType<typeof setTimeout> | null;
}

const watchers = new Map<string, WatcherEntry>();

function watcherKey(username: string, repoName: string): string {
  return `${username}:${repoName}`;
}

function distDir(username: string, repoName: string): string {
  return resolve(`/tmp/pi-web-users/${username}/workspace/repos/${repoName}/dist`);
}

function readPreviewState(username: string, repoName: string): PreviewState {
  const dd = distDir(username, repoName);
  const distExists = existsSync(dd);
  const indexPath = resolve(dd, "index.html");
  const indexHtmlExists = existsSync(indexPath);

  let lastBuildAt: number | null = null;
  if (indexHtmlExists) {
    try {
      lastBuildAt = statSync(indexPath).mtimeMs;
    } catch {}
  }

  return {
    repoName,
    status: indexHtmlExists ? "ready" : "idle",
    distExists,
    indexHtmlExists,
    lastBuildAt,
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

export function ensureWatcher(username: string, repoName: string) {
  const key = watcherKey(username, repoName);
  if (watchers.has(key)) return;

  const dd = distDir(username, repoName);
  if (!existsSync(dd)) return;

  try {
    const watcher = watch(dd, { recursive: true }, (eventType, filename) => {
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

    watchers.set(key, { watcher, timer: null });
  } catch {
    // fs.watch may fail on some Docker overlay filesystems; handled by polling fallback
  }
}

export function removeWatcher(username: string, repoName: string) {
  const key = watcherKey(username, repoName);
  const entry = watchers.get(key);
  if (entry) {
    if (entry.timer) clearTimeout(entry.timer);
    try {
      entry.watcher.close();
    } catch {}
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
