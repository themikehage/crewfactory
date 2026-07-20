import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { getUsername } from "../lib/auth-helpers";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { agentRegistry } from "../agents";
import { getWorkspaceSkillsDir, getAgentDir } from "shared";

export const galleryRouter = new Hono();

galleryRouter.use("/*", authMiddleware);

function getCommunityDir(): string {
  let dir = join(process.cwd(), "community");
  if (existsSync(dir)) return dir;
  
  dir = join(process.cwd(), "../../community");
  if (existsSync(dir)) return dir;
  
  return join(process.cwd(), "community");
}

galleryRouter.get("/blueprints", (c) => {
  const communityDir = getCommunityDir();
  const agentsDir = join(communityDir, "agents");
  const blueprints: any[] = [];

  // Load agent blueprints
  if (existsSync(agentsDir)) {
    try {
      const dirs = readdirSync(agentsDir, { withFileTypes: true });
      for (const d of dirs) {
        if (d.isDirectory()) {
          const bpPath = join(agentsDir, d.name, "blueprint.json");
          if (existsSync(bpPath)) {
            try {
              const bp = JSON.parse(readFileSync(bpPath, "utf-8"));
              blueprints.push({
                id: d.name,
                type: "agent",
                definition: bp.definition,
                metadata: bp.metadata,
                hasIcon: existsSync(join(agentsDir, d.name, "icon.svg")),
              });
            } catch (e) {
              console.error(`Failed to parse blueprint.json in ${d.name}:`, e);
            }
          }
        }
      }
    } catch (err) {
      console.error("Error loading agent blueprints:", err);
    }
  }

  return c.json({ blueprints });
});

galleryRouter.get("/blueprints/:id/icon", (c) => {
  const id = c.req.param("id");
  const communityDir = getCommunityDir();
  
  // Try agent icon
  const agentIconPath = join(communityDir, "agents", id, "icon.svg");
  if (existsSync(agentIconPath)) {
    return c.body(readFileSync(agentIconPath, "utf-8"), 200, {
      "Content-Type": "image/svg+xml"
    });
  }

  return c.notFound();
});

galleryRouter.post("/blueprints/:id/install", async (c) => {
  const username = getUsername(c);
  if (!username) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const communityDir = getCommunityDir();

  // 1. Locate blueprint
  const bpPath = join(communityDir, "agents", id, "blueprint.json");

  if (!existsSync(bpPath)) {
    return c.json({ error: `Blueprint "${id}" not found` }, 404);
  }

  try {
    const bp = JSON.parse(readFileSync(bpPath, "utf-8"));

    const definition = bp.definition;
    // Mark with blueprintId
    definition.blueprintId = id;

    // Check if already exists
    if (agentRegistry.get(definition.id, username)) {
      return c.json({ error: `Agent "${definition.name}" is already installed` }, 409);
    }

    // Provision skills if needed
    if (definition.skills && definition.skills.length > 0) {
      const userWorkspaceSkillsDir = getWorkspaceSkillsDir(username);
      const communitySkillsDir = join(communityDir, "skills");

      for (const skillName of definition.skills) {
        const userSkillDir = join(userWorkspaceSkillsDir, skillName);
        if (!existsSync(userSkillDir)) {
          // Find in community/skills
          const communitySkillPath = join(communitySkillsDir, skillName, "SKILL.md");
          if (existsSync(communitySkillPath)) {
            mkdirSync(userSkillDir, { recursive: true });
            copyFileSync(communitySkillPath, join(userSkillDir, "SKILL.md"));
          }
        }
      }
    }

    // Register the agent
    await agentRegistry.register(username, definition, true);
    
    // Copy avatar icon if present
    const bpIconPath = join(communityDir, "agents", id, "icon.svg");
    if (existsSync(bpIconPath)) {
      const agentDir = getAgentDir(username, definition.id);
      mkdirSync(agentDir, { recursive: true });
      copyFileSync(bpIconPath, join(agentDir, "avatar.svg"));
      agentRegistry.setAvatarUrl(username, definition.id, `/api/agents/${definition.id}/avatar`);
    }

    return c.json({
      success: true,
      type: "agent",
      id: definition.id,
      name: definition.name,
    });

  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});
