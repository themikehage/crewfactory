import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { getUsername } from "../lib/auth-helpers";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { agentRegistry } from "../agents";
import { channelStore } from "../channels";

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
  const channelsDir = join(communityDir, "channels");
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

  // Load channel blueprints
  if (existsSync(channelsDir)) {
    try {
      const dirs = readdirSync(channelsDir, { withFileTypes: true });
      for (const d of dirs) {
        if (d.isDirectory()) {
          const bpPath = join(channelsDir, d.name, "blueprint.json");
          if (existsSync(bpPath)) {
            try {
              const bp = JSON.parse(readFileSync(bpPath, "utf-8"));
              blueprints.push({
                id: d.name,
                type: "channel",
                definition: bp.definition,
                metadata: bp.metadata,
                hasIcon: existsSync(join(channelsDir, d.name, "icon.svg")),
              });
            } catch (e) {
              console.error(`Failed to parse blueprint.json in ${d.name}:`, e);
            }
          }
        }
      }
    } catch (err) {
      console.error("Error loading channel blueprints:", err);
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

  // Try channel icon
  const channelIconPath = join(communityDir, "channels", id, "icon.svg");
  if (existsSync(channelIconPath)) {
    return c.body(readFileSync(channelIconPath, "utf-8"), 200, {
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
  let bpPath = join(communityDir, "agents", id, "blueprint.json");
  let type: "agent" | "channel" = "agent";
  if (!existsSync(bpPath)) {
    bpPath = join(communityDir, "channels", id, "blueprint.json");
    type = "channel";
  }

  if (!existsSync(bpPath)) {
    return c.json({ error: `Blueprint "${id}" not found` }, 404);
  }

  try {
    const bp = JSON.parse(readFileSync(bpPath, "utf-8"));

    if (type === "agent") {
      const definition = bp.definition;
      // Mark with blueprintId
      definition.blueprintId = id;

      // Check if already exists
      if (agentRegistry.get(definition.id, username)) {
        return c.json({ error: `Agent "${definition.name}" is already installed` }, 409);
      }

      // Provision skills if needed
      if (definition.skills && definition.skills.length > 0) {
        const userWorkspaceSkillsDir = join("/tmp/crewfactory", username, "workspace", ".agents", "skills");
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
        const agentDir = join("/tmp/crewfactory", username, "agents", definition.id);
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

    } else {
      // Channel
      const definition = bp.definition;
      definition.id = id; // use folder name as channel id
      definition.blueprintId = id;

      // Check if channel already exists
      if (channelStore.getChannel(username, id)) {
        return c.json({ error: `Channel "${definition.name}" is already installed` }, 409);
      }

      // Verify that all member agents exist or install them!
      if (definition.members && definition.members.length > 0) {
        for (const m of definition.members) {
          const agentExists = agentRegistry.get(m.agentId, username);
          if (!agentExists) {
            // Check if there is an Agent Blueprint with this ID
            const agentBpPath = join(communityDir, "agents", m.agentId, "blueprint.json");
            if (existsSync(agentBpPath)) {
              // Auto install agent blueprint first!
              const agentBp = JSON.parse(readFileSync(agentBpPath, "utf-8"));
              const agentDef = agentBp.definition;
              agentDef.blueprintId = m.agentId;

              // Provision skills for this agent
              if (agentDef.skills && agentDef.skills.length > 0) {
                const userWorkspaceSkillsDir = join("/tmp/crewfactory", username, "workspace", ".agents", "skills");
                const communitySkillsDir = join(communityDir, "skills");

                for (const skillName of agentDef.skills) {
                  const userSkillDir = join(userWorkspaceSkillsDir, skillName);
                  if (!existsSync(userSkillDir)) {
                    const communitySkillPath = join(communitySkillsDir, skillName, "SKILL.md");
                    if (existsSync(communitySkillPath)) {
                      mkdirSync(userSkillDir, { recursive: true });
                      copyFileSync(communitySkillPath, join(userSkillDir, "SKILL.md"));
                    }
                  }
                }
              }

              // Register the agent
              await agentRegistry.register(username, agentDef, true);

              // Copy avatar icon if present
              const bpIconPath = join(communityDir, "agents", m.agentId, "icon.svg");
              if (existsSync(bpIconPath)) {
                const agentDir = join("/tmp/crewfactory", username, "agents", agentDef.id);
                mkdirSync(agentDir, { recursive: true });
                copyFileSync(bpIconPath, join(agentDir, "avatar.svg"));
                agentRegistry.setAvatarUrl(username, agentDef.id, `/api/agents/${agentDef.id}/avatar`);
              }
            } else {
              return c.json({ error: `Member agent "${m.agentId}" does not exist and no blueprint found to auto-install it.` }, 400);
            }
          }
        }
      }

      // Create channel
      const channel = channelStore.createChannel(username, definition);

      // Add members to channel
      if (definition.members && definition.members.length > 0) {
        channelStore.updateMembers(username, channel.id, definition.members);
      }

      return c.json({
        success: true,
        type: "channel",
        id: channel.id,
        name: channel.name,
      });
    }

  } catch (err) {
    return c.json({ error: String(err) }, 500);
  }
});
