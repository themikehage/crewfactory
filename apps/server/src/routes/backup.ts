import { Hono } from "hono";
import { authMiddleware, getAuthPayload } from "../middleware/auth";
import { sessionManager } from "../core/session-manager";
import { agentRegistry } from "../agents";
import { rmSync, mkdirSync, existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import AdmZip from "adm-zip";
import { getUserDir } from "shared";

export const backupRouter = new Hono();
backupRouter.use("/*", authMiddleware);

async function addFilesRecursively(
  zip: AdmZip,
  currentDir: string,
  baseDir: string,
  type: "light" | "full"
) {
  if (!existsSync(currentDir)) return;
  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(currentDir, entry.name);
    const relPath = relative(baseDir, fullPath).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      if (["dist", "build", ".next", ".output", "out"].includes(entry.name)) continue;

      if (type === "light") {
        const parts = relPath.split("/");
        const isWorkspaceParent = parts[0] === "workspace";
        const isAgentsParent = parts[0] === "agents";
        const isChannelsParent = parts[0] === "channels";

        // Only traverse directories relevant to configs, skills, agents, channels
        const shouldTraverse =
          (isWorkspaceParent && (parts.length === 1 || relPath.startsWith("workspace/.agents"))) ||
          (isAgentsParent && parts.length <= 2) ||
          (isChannelsParent && parts.length <= 2);

        if (shouldTraverse) {
          await addFilesRecursively(zip, fullPath, baseDir, type);
        }
      } else {
        await addFilesRecursively(zip, fullPath, baseDir, type);
      }
    } else {
      if (type === "light") {
        const parts = relPath.split("/");
        const isRootConfig = parts.length === 1 && ["credentials.json", "auth.json", "integrations.json", "env.json", "mcp-servers.json", "mcp-config.json"].includes(parts[0]);
        const isCustomSkill = relPath.startsWith("workspace/.agents/skills/");
        const isAgentDef = parts.length === 3 && parts[0] === "agents" && parts[2] === "definition.json";
        const isChannelDef = parts.length === 3 && parts[0] === "channels" && parts[2] === "channel.json";

        if (isRootConfig || isCustomSkill || isAgentDef || isChannelDef) {
          const content = await Bun.file(fullPath).arrayBuffer();
          zip.addFile(relPath, Buffer.from(content));
        }
      } else {
        const content = await Bun.file(fullPath).arrayBuffer();
        zip.addFile(relPath, Buffer.from(content));
      }
    }
  }
}

backupRouter.get("/export", async (c) => {
  const { username } = getAuthPayload(c);
  const type = c.req.query("type") === "full" ? "full" : "light";
  const userDir = getUserDir(username);

  if (!existsSync(userDir)) {
    return c.json({ error: "User directory not found" }, 404);
  }

  try {
    const zip = new AdmZip();
    await addFilesRecursively(zip, userDir, userDir, type);

    const buffer = zip.toBuffer();
    const date = new Date().toISOString().slice(0, 10);
    const filename = `crewfactory-backup-${username}-${type}-${date}.zip`;

    return new Response(buffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e: any) {
    console.error("Backup export failed:", e);
    return c.json({ error: `Export failed: ${e.message || e}` }, 500);
  }
});

backupRouter.post("/import", async (c) => {
  const { username } = getAuthPayload(c);
  const mode = c.req.query("mode") === "overwrite" ? "overwrite" : "merge";

  const body = await c.req.parseBody();
  const file = body.file;
  if (!file || !(file instanceof File)) {
    return c.json({ error: "No backup file uploaded" }, 400);
  }

  const userDir = getUserDir(username);

  try {
    // 1. Safe shutdown of active user sessions
    await sessionManager.destroyAllSessions(username);
    sessionManager.userConfig.clearUserContext(username);

    // 2. Stop programmatic agents for this user
    for (const info of agentRegistry.list(username)) {
      await agentRegistry.stop(info.id, false);
    }

    // 3. Handle overwrite mode
    if (mode === "overwrite" && existsSync(userDir)) {
      rmSync(userDir, { recursive: true, force: true });
    }

    // 4. Create user directory if it doesn't exist
    if (!existsSync(userDir)) {
      mkdirSync(userDir, { recursive: true });
    }

    // 5. Read file buffer and extract
    const arrayBuffer = await file.arrayBuffer();
    const zip = new AdmZip(Buffer.from(arrayBuffer));
    zip.extractAllTo(userDir, true);

    // 6. Reload agent registry
    await agentRegistry.reloadUserAgents(username);

    return c.json({ success: true, message: `Backup imported successfully in ${mode} mode.` });
  } catch (e: any) {
    console.error("Backup import failed:", e);
    return c.json({ error: `Import failed: ${e.message || e}` }, 500);
  }
});
