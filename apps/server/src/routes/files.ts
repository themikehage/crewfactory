import { Hono } from "hono";
import { resolve, normalize, sep, join, basename, dirname } from "node:path";
import { existsSync, readdirSync, statSync, mkdirSync, writeFileSync, unlinkSync, rmSync, renameSync, readFileSync } from "node:fs";
import { getUsername } from "../lib/auth-helpers";
import { sessionMiddleware } from "../auth/middleware";
import { sessionManager } from "../core/session-manager";
import {
  getWorkspaceDir, getProjectsDir, getProjectWorkspaceDir,
  getChannelWorkspaceDir, getAgentWorkspaceDir, getTeamWorkspaceDir,
  getSessionDir, getUserDir
} from "shared";
import { scopeConfigManager } from "../core/scope";
import { applyCacheHeaders } from "../core/cache-headers";

export const filesRouter = new Hono();

filesRouter.use("/*", sessionMiddleware);

function validateWorkspacePath(username: string, relativePath: string, projectName?: string, agentId?: string, channelId?: string, teamId?: string): string {
  const workspaceBase = getWorkspaceDir(username);
  let workspaceDir = workspaceBase;

  if (teamId) {
    workspaceDir = getTeamWorkspaceDir(username, teamId);
  } else if (channelId) {
    workspaceDir = getChannelWorkspaceDir(username, channelId);
  } else if (agentId) {
    workspaceDir = getAgentWorkspaceDir(username, agentId);
  } else if (projectName) {
    workspaceDir = getProjectWorkspaceDir(username, projectName);
  }

  // Resolve the workspace directory to avoid drive letter/case mismatch on Windows
  const resolvedWorkspaceDir = resolve(workspaceDir);

  if (!existsSync(resolvedWorkspaceDir)) {
    mkdirSync(resolvedWorkspaceDir, { recursive: true });
  }

  const normalized = normalize(relativePath.trim() || ".");
  const fullPath = resolve(resolvedWorkspaceDir, normalized);

  if (fullPath !== resolvedWorkspaceDir && !fullPath.startsWith(resolvedWorkspaceDir + sep)) {
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

  const sessionPath = join(getSessionDir(username, sessionId), filePath);
  let finalPath = sessionPath;
  if (!existsSync(sessionPath)) {
    const workspacePath = join(getWorkspaceDir(username), filePath);
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

  const cacheResponse = applyCacheHeaders(c, finalPath);
  if (cacheResponse) {
    return cacheResponse;
  }

  const responseHeaders: Record<string, string> = {
    "Content-Type": file.type || "application/octet-stream",
  };
  c.res.headers.forEach((val, key) => {
    responseHeaders[key] = val;
  });

  return new Response(file.stream(), {
    headers: responseHeaders,
  });
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
    const projectName = c.req.query("project");
    const agentId = c.req.query("agentId");
    const channelId = c.req.query("channelId");
    const teamId = c.req.query("teamId");
    const fullPath = validateWorkspacePath(username, relativePath, projectName, agentId, channelId, teamId);
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
        const isImmutable = fullPath.includes("/assets/generated/") || fullPath.includes("\\assets\\generated\\");
        const cacheResponse = applyCacheHeaders(c, fullPath, { immutable: isImmutable });
        if (cacheResponse) return cacheResponse;

        const responseHeaders: Record<string, string> = {
          "Content-Type": file.type || "application/octet-stream",
        };
        c.res.headers.forEach((val: string, key: string) => {
          responseHeaders[key] = val;
        });

        return new Response(file.stream(), {
          headers: responseHeaders,
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

// GET: list projects
filesRouter.get("/workspace-projects", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  try {
    const projectsDir = getProjectsDir(username);
    if (!existsSync(projectsDir)) {
      mkdirSync(projectsDir, { recursive: true });
    }

    const entries = readdirSync(projectsDir, { withFileTypes: true });
    const projects = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const entryPath = join(projectsDir, entry.name);
        const jsonPath = join(entryPath, "project.json");
        let projName = entry.name;
        let cloneUrl = null;
        let createdAt = null;
        if (existsSync(jsonPath)) {
          try {
            const proj = JSON.parse(readFileSync(jsonPath, "utf-8"));
            projName = proj.name || entry.name;
            cloneUrl = proj.cloneUrl || null;
            createdAt = proj.createdAt || null;
          } catch {}
        } else {
          try {
            createdAt = new Date().toISOString();
            writeFileSync(jsonPath, JSON.stringify({ id: entry.name, name: entry.name, cloneUrl: null, createdAt }, null, 2), "utf-8");
          } catch {}
        }
        const stat = statSync(entryPath);
        projects.push({
          id: entry.name,
          name: projName,
          path: entry.name,
          cloneUrl,
          createdAt,
          diskPath: getProjectWorkspaceDir(username, entry.name),
          lastModified: stat.mtime.toISOString(),
        });
      }
    }

    return c.json({ projects, repos: projects });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to list projects" }, 500);
  }
});

// POST: create or clone project
filesRouter.post("/workspace-projects", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  try {
    const body = await c.req.json().catch(() => ({}));
    const { name, cloneUrl } = body;

    if (!name || typeof name !== "string" || !/^[a-zA-Z0-9_-]+$/.test(name)) {
      return c.json({ error: "Invalid project name" }, 400);
    }

    const projectsDir = getProjectsDir(username);
    if (!existsSync(projectsDir)) {
      mkdirSync(projectsDir, { recursive: true });
    }

    const projectId = crypto.randomUUID();
    const baseDir = join(projectsDir, projectId);
    const targetDir = join(baseDir, "workspace");

    if (cloneUrl) {
      if (typeof cloneUrl !== "string" || !cloneUrl.startsWith("http")) {
        return c.json({ error: "Invalid clone URL" }, 400);
      }

      mkdirSync(baseDir, { recursive: true });
      const proc = Bun.spawn(["git", "clone", cloneUrl, "workspace"], {
        cwd: baseDir,
      });
      await proc.exited;
      if (proc.exitCode !== 0) {
        rmSync(baseDir, { recursive: true, force: true });
        return c.json({ error: "Git clone failed" }, 500);
      }
    } else {
      mkdirSync(targetDir, { recursive: true });
      const proc = Bun.spawn(["git", "init"], {
        cwd: targetDir,
      });
      await proc.exited;
    }

    const projectJson = {
      id: projectId,
      name: name,
      cloneUrl: cloneUrl || null,
      createdAt: new Date().toISOString(),
    };
    writeFileSync(join(baseDir, "project.json"), JSON.stringify(projectJson, null, 2), "utf-8");

    const stat = statSync(targetDir);
    return c.json({
      id: projectId,
      name,
      path: projectId,
      lastModified: stat.mtime.toISOString(),
    }, 201);
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to create project" }, 500);
  }
});

filesRouter.delete("/workspace-projects/:id", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");

  try {
    const projectsDir = getProjectsDir(username);
    const projectPath = join(projectsDir, id);

    if (!existsSync(projectPath)) {
      return c.json({ error: "Project not found" }, 404);
    }

    const sessions = await sessionManager.listSessions(username);
    for (const s of sessions) {
      if (s.projectName === id) {
        await sessionManager.destroySession(username, s.id);
      }
    }

    await scopeConfigManager.removeProjectScope(username, id);
    rmSync(projectPath, { recursive: true, force: true });
    return c.body(null, 204);
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to delete project" }, 500);
  }
});

filesRouter.get("/workspace-projects/:id/agents", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");
  const { agentRegistry } = await import("../agents/agent-registry");
  return c.json({ agents: agentRegistry.listScoped(username, "projects", id) });
});

filesRouter.patch("/workspace-projects/:id", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);
  const id = c.req.param("id");

  try {
    const body = await c.req.json().catch(() => ({}));
    const { name, cloneUrl } = body;

    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
      return c.json({ error: "Invalid project name" }, 400);
    }
    if (cloneUrl !== undefined && cloneUrl !== null && (typeof cloneUrl !== "string" || (cloneUrl !== "" && !cloneUrl.startsWith("http")))) {
      return c.json({ error: "Invalid clone URL" }, 400);
    }

    const projectsDir = getProjectsDir(username);
    const projectPath = join(projectsDir, id);
    const jsonPath = join(projectPath, "project.json");

    if (!existsSync(projectPath) || !existsSync(jsonPath)) {
      return c.json({ error: "Project not found" }, 404);
    }

    const projectJson = JSON.parse(readFileSync(jsonPath, "utf-8"));
    if (name !== undefined) {
      projectJson.name = name.trim();
    }
    if (cloneUrl !== undefined) {
      projectJson.cloneUrl = cloneUrl ? cloneUrl.trim() : null;
    }

    writeFileSync(jsonPath, JSON.stringify(projectJson, null, 2), "utf-8");

    return c.json({
      id,
      name: projectJson.name,
      path: id,
      cloneUrl: projectJson.cloneUrl,
      createdAt: projectJson.createdAt || null,
      diskPath: getProjectWorkspaceDir(username, id),
      lastModified: statSync(projectPath).mtime.toISOString(),
    });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to update project" }, 500);
  }
});

filesRouter.post("/workspace/refresh", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  try {
    const body = await c.req.json().catch(() => ({}));
    const { type } = body;

    const { broadcastToUser } = await import("../ws/handler");
    broadcastToUser(username, {
      type: "entity-updated",
      entityType: type || "all",
    });

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to refresh workspace" }, 500);
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
    const projectName = c.req.query("project");
    const agentId = c.req.query("agentId");
    const channelId = c.req.query("channelId");
    const teamId = c.req.query("teamId");
    const fullPath = validateWorkspacePath(username, relativePath, projectName, agentId, channelId, teamId);
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
    const projectName = c.req.query("project");
    const agentId = c.req.query("agentId");
    const channelId = c.req.query("channelId");
    const teamId = c.req.query("teamId");
    const fullPath = validateWorkspacePath(username, relativePath, projectName, agentId, channelId, teamId);
    const body = await c.req.parseBody();
    const file = body.file as File | undefined;
    if (!file) {
      return c.json({ error: "No file provided" }, 400);
    }

    const fileRelativePath = body.relativePath as string | undefined;
    let savePath = fileRelativePath ? join(fullPath, fileRelativePath) : fullPath;

    // If destination path exists and is a directory, save file inside it
    if (existsSync(savePath) && statSync(savePath).isDirectory()) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      savePath = join(savePath, safeName);
    }

    // Validate the final resolved file save path
    const resolvedSavePath = resolve(savePath);
    const workspaceBase = getWorkspaceDir(username);
    let workspaceDir = workspaceBase;
    if (teamId) {
      workspaceDir = getTeamWorkspaceDir(username, teamId);
    } else if (channelId) {
      workspaceDir = getChannelWorkspaceDir(username, channelId);
    } else if (agentId) {
      workspaceDir = getAgentWorkspaceDir(username, agentId);
    } else if (projectName) {
      workspaceDir = getProjectWorkspaceDir(username, projectName);
    }
    const resolvedWorkspaceDir = resolve(workspaceDir);
    if (!resolvedSavePath.startsWith(resolvedWorkspaceDir + sep) && resolvedSavePath !== resolvedWorkspaceDir) {
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
    const projectName = c.req.query("project");
    const agentId = c.req.query("agentId");
    const channelId = c.req.query("channelId");
    const teamId = c.req.query("teamId");
    const fullPath = validateWorkspacePath(username, relativePath, projectName, agentId, channelId, teamId);
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
    const projectName = c.req.query("project");
    const agentId = c.req.query("agentId");
    const channelId = c.req.query("channelId");
    const teamId = c.req.query("teamId");
    const fullPath = validateWorkspacePath(username, relativePath, projectName, agentId, channelId, teamId);
    if (!existsSync(fullPath)) {
      return c.json({ error: "Source file not found" }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const { newPath } = body;
    if (!newPath || newPath.includes("..")) {
      return c.json({ error: "Invalid target path" }, 400);
    }

    const targetFullPath = validateWorkspacePath(username, newPath, projectName, agentId, channelId, teamId);
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
