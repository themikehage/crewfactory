import { Hono } from "hono";
import { resolve, normalize, sep, join, basename, dirname } from "node:path";
import { existsSync, readdirSync, statSync, mkdirSync, writeFileSync, unlinkSync, rmSync, renameSync } from "node:fs";
import { getUsername } from "../lib/auth-helpers";

export const filesRouter = new Hono();

function validateWorkspacePath(username: string, relativePath: string, repoName?: string): string {
  const workspaceBase = resolve(`/tmp/pi-web-users/${username}/workspace`);
  const workspaceDir = repoName
    ? resolve(workspaceBase, "repos", repoName)
    : workspaceBase;

  if (!existsSync(workspaceDir)) {
    mkdirSync(workspaceDir, { recursive: true });
  }

  const normalized = normalize(relativePath.trim() || ".");
  const fullPath = resolve(workspaceDir, normalized);

  if (fullPath !== workspaceDir && !fullPath.startsWith(workspaceDir + sep)) {
    throw new Error("Path traversal detected");
  }

  return fullPath;
}

// ---------------------------------------------------------
// 1. Session Files Endpoint (for backward-compatibility)
// ---------------------------------------------------------
filesRouter.get("/sessions/:sessionId/files/*", async (c) => {
  const sessionId = c.req.param("sessionId");
  const filePath = c.req.param("*") || "";

  if (filePath.includes("..")) {
    return c.text("Forbidden", 403);
  }

  const username = getUsername(c);
  if (!username) {
    return c.text("Unauthorized", 401);
  }

  const sessionPath = `/tmp/pi-web-users/${username}/sessions/${sessionId}/${filePath}`;
  let finalPath = sessionPath;
  if (!existsSync(sessionPath)) {
    const workspacePath = `/tmp/pi-web-users/${username}/workspace/${filePath}`;
    if (existsSync(workspacePath)) {
      finalPath = workspacePath;
    } else {
      return c.notFound();
    }
  }

  const file = Bun.file(finalPath);
  const exists = await file.exists();
  if (!exists) {
    return c.notFound();
  }

  const download = c.req.query("download");
  if (download === "1" || download === "true") {
    const fileName = filePath.split("/").pop() || "download";
    return new Response(file.stream(), {
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  }

  return c.body(file.stream());
});

function getRelativePath(c: any): string {
  const prefix = "/api/workspace";
  let relativePath = "";
  if (c.req.path.startsWith(prefix)) {
    relativePath = c.req.path.substring(prefix.length);
    if (relativePath.startsWith("/")) {
      relativePath = relativePath.substring(1);
    }
  }
  return decodeURIComponent(relativePath);
}

// ---------------------------------------------------------
// 2. Persistent User Workspace Endpoints
// ---------------------------------------------------------

// GET: list directory files or fetch specific file details/stream
const handleGetWorkspace = async (c: any) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const relativePath = getRelativePath(c);
  if (relativePath.includes("..")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  try {
    const repoName = c.req.query("repo");
    const fullPath = validateWorkspacePath(username, relativePath, repoName);
    if (!existsSync(fullPath)) {
      return c.json({ error: "Path does not exist" }, 404);
    }

    const stat = statSync(fullPath);
    const isDir = stat.isDirectory();

    const download = c.req.query("download") === "1" || c.req.query("download") === "true";
    const raw = c.req.query("raw") === "1" || c.req.query("raw") === "true";

    if (isDir) {
      const entries = readdirSync(fullPath, { withFileTypes: true });
      const children = entries
        .filter(entry => entry.name !== ".git" && entry.name !== "node_modules")
        .map(entry => {
          const entryFullPath = join(fullPath, entry.name);
          const entryStat = statSync(entryFullPath);
          const entryRelativePath = relativePath
            ? `${relativePath}/${entry.name}`.replace(/\\/g, "/")
            : entry.name;
          return {
            name: entry.name,
            path: entryRelativePath,
            isDirectory: entry.isDirectory(),
            size: entry.isDirectory() ? 0 : entryStat.size,
            lastModified: entryStat.mtime.toISOString(),
          };
        });

      // Sort: folders first, then files alphabetically
      children.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      return c.json({
        name: relativePath ? basename(fullPath) : "workspace",
        path: relativePath,
        isDirectory: true,
        size: 0,
        children,
        lastModified: stat.mtime.toISOString(),
      });
    } else {
      // It is a file
      const file = Bun.file(fullPath);

      if (raw) {
        return new Response(file.stream(), {
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
        });
      }

      if (download) {
        return new Response(file.stream(), {
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "Content-Disposition": `attachment; filename="${basename(fullPath)}"`,
          },
        });
      }

      // Default: Return file metadata and base64 encoded text contents for viewer/editor
      let content = "";
      if (stat.size < 5 * 1024 * 1024) { // 5MB limit
        try {
          const buffer = await file.arrayBuffer();
          content = Buffer.from(buffer).toString("base64");
        } catch {
          // ignore read failure
        }
      }

      return c.json({
        name: basename(fullPath),
        path: relativePath,
        isDirectory: false,
        size: stat.size,
        mimeType: file.type || "text/plain",
        content,
        lastModified: stat.mtime.toISOString(),
      });
    }
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to access path" }, 500);
  }
};

// GET: list repos
filesRouter.get("/workspace-repos", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  try {
    const reposDir = resolve(`/tmp/pi-web-users/${username}/workspace/repos`);
    if (!existsSync(reposDir)) {
      mkdirSync(reposDir, { recursive: true });
    }

    const entries = readdirSync(reposDir, { withFileTypes: true });
    const repos = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const entryPath = join(reposDir, entry.name);
        const stat = statSync(entryPath);
        return {
          name: entry.name,
          path: entry.name,
          lastModified: stat.mtime.toISOString(),
        };
      });

    return c.json({ repos });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to list repositories" }, 500);
  }
});

// POST: create or clone repo
filesRouter.post("/workspace-repos", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  try {
    const body = await c.req.json().catch(() => ({}));
    const { name, cloneUrl } = body;

    if (!name || typeof name !== "string" || !/^[a-zA-Z0-9_-]+$/.test(name)) {
      return c.json({ error: "Invalid repository name" }, 400);
    }

    const reposDir = resolve(`/tmp/pi-web-users/${username}/workspace/repos`);
    if (!existsSync(reposDir)) {
      mkdirSync(reposDir, { recursive: true });
    }

    const targetDir = join(reposDir, name);
    if (existsSync(targetDir)) {
      return c.json({ error: "Repository or directory already exists" }, 409);
    }

    if (cloneUrl) {
      if (typeof cloneUrl !== "string" || !cloneUrl.startsWith("http")) {
        return c.json({ error: "Invalid clone URL" }, 400);
      }

      const proc = Bun.spawn(["git", "clone", cloneUrl, name], {
        cwd: reposDir,
      });
      await proc.exited;
      if (proc.exitCode !== 0) {
        return c.json({ error: "Git clone failed" }, 500);
      }
    } else {
      mkdirSync(targetDir, { recursive: true });
      const proc = Bun.spawn(["git", "init"], {
        cwd: targetDir,
      });
      await proc.exited;
    }

    const stat = statSync(targetDir);
    return c.json({
      name,
      path: name,
      lastModified: stat.mtime.toISOString(),
    }, 201);
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to create repository" }, 500);
  }
});

filesRouter.get("/workspace", handleGetWorkspace);
filesRouter.get("/workspace/*", handleGetWorkspace);

// PUT: create file or folder
const handlePutWorkspace = async (c: any) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const relativePath = getRelativePath(c);
  console.log("PUT workspace received:", { relativePath, path: c.req.path, username });
  if (relativePath.includes("..") || !relativePath) {
    return c.json({ error: "Forbidden or empty path" }, 403);
  }

  try {
    const repoName = c.req.query("repo");
    const fullPath = validateWorkspacePath(username, relativePath, repoName);
    const body = await c.req.json().catch(() => ({}));
    const { type, content } = body;

    if (type === "folder") {
      mkdirSync(fullPath, { recursive: true });
      return c.json({
        name: basename(fullPath),
        path: relativePath,
        isDirectory: true,
        size: 0,
        lastModified: new Date().toISOString(),
      });
    } else {
      // ensure parent folder exists
      mkdirSync(dirname(fullPath), { recursive: true });
      const textContent = content || "";
      writeFileSync(fullPath, textContent, "utf8");

      return c.json({
        name: basename(fullPath),
        path: relativePath,
        isDirectory: false,
        size: textContent.length,
        lastModified: new Date().toISOString(),
      });
    }
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to create resource" }, 500);
  }
};

filesRouter.put("/workspace", handlePutWorkspace);
filesRouter.put("/workspace/*", handlePutWorkspace);

// POST: upload file (multipart form data)
const handlePostWorkspace = async (c: any) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const relativePath = getRelativePath(c);
  if (relativePath.includes("..")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  try {
    const repoName = c.req.query("repo");
    const fullPath = validateWorkspacePath(username, relativePath, repoName);
    const body = await c.req.parseBody();
    const file = body.file as File | undefined;
    if (!file) {
      return c.json({ error: "No file provided" }, 400);
    }

    const fileRelativePath = body.relativePath as string | undefined;
    const savePath = fileRelativePath ? join(fullPath, fileRelativePath) : fullPath;

    // Validate the final resolved file save path
    const resolvedSavePath = resolve(savePath);
    const workspaceBase = resolve(`/tmp/pi-web-users/${username}/workspace`);
    const workspaceDir = repoName
      ? resolve(workspaceBase, "repos", repoName)
      : workspaceBase;
    if (!resolvedSavePath.startsWith(workspaceDir + sep) && resolvedSavePath !== workspaceDir) {
      return c.json({ error: "Forbidden path traversal in upload" }, 403);
    }

    mkdirSync(dirname(resolvedSavePath), { recursive: true });
    const buffer = await file.arrayBuffer();
    writeFileSync(resolvedSavePath, Buffer.from(buffer));

    return c.json({
      name: basename(resolvedSavePath),
      path: relativePath ? `${relativePath}/${fileRelativePath || basename(resolvedSavePath)}`.replace(/\\/g, "/") : fileRelativePath || basename(resolvedSavePath),
      size: file.size,
      mimeType: file.type || "application/octet-stream",
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Upload failed" }, 500);
  }
};

filesRouter.post("/workspace", handlePostWorkspace);
filesRouter.post("/workspace/*", handlePostWorkspace);

// DELETE: delete file or folder
const handleDeleteWorkspace = async (c: any) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const relativePath = getRelativePath(c);
  if (relativePath.includes("..") || !relativePath) {
    return c.json({ error: "Forbidden or empty path" }, 403);
  }

  try {
    const repoName = c.req.query("repo");
    const fullPath = validateWorkspacePath(username, relativePath, repoName);
    if (!existsSync(fullPath)) {
      return c.json({ error: "File not found" }, 404);
    }

    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      rmSync(fullPath, { recursive: true, force: true });
    } else {
      unlinkSync(fullPath);
    }

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to delete resource" }, 500);
  }
};

filesRouter.delete("/workspace", handleDeleteWorkspace);
filesRouter.delete("/workspace/*", handleDeleteWorkspace);

// PATCH: rename or move
const handlePatchWorkspace = async (c: any) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const relativePath = getRelativePath(c);
  if (relativePath.includes("..") || !relativePath) {
    return c.json({ error: "Forbidden or empty path" }, 403);
  }

  try {
    const repoName = c.req.query("repo");
    const fullPath = validateWorkspacePath(username, relativePath, repoName);
    if (!existsSync(fullPath)) {
      return c.json({ error: "Source file not found" }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const { newPath } = body;
    if (!newPath || newPath.includes("..")) {
      return c.json({ error: "Invalid target path" }, 400);
    }

    const targetFullPath = validateWorkspacePath(username, newPath, repoName);
    mkdirSync(dirname(targetFullPath), { recursive: true });
    renameSync(fullPath, targetFullPath);

    const targetStat = statSync(targetFullPath);
    return c.json({
      name: basename(targetFullPath),
      path: newPath,
      isDirectory: targetStat.isDirectory(),
      size: targetStat.isDirectory() ? 0 : targetStat.size,
      lastModified: targetStat.mtime.toISOString(),
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to rename resource" }, 500);
  }
};

filesRouter.patch("/workspace", handlePatchWorkspace);
filesRouter.patch("/workspace/*", handlePatchWorkspace);
