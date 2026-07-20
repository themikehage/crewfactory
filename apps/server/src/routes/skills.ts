import { Hono } from "hono";
import { loadSkills } from "../ai/load-skills";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { authMiddleware, getAuthPayload } from "../middleware/auth";
import { getResolvedSkillPaths } from "../core/session-manager";
import { join } from "node:path";
import { getWorkspaceDir, getUserDir } from "shared";

export const skillsRouter = new Hono();

skillsRouter.use("/*", authMiddleware);

skillsRouter.get("/", async (c) => {
  const { username } = getAuthPayload(c);

  try {
    const workspaceDir = getWorkspaceDir(username);
    const skillPaths = getResolvedSkillPaths(workspaceDir);
    const result = loadSkills({
      cwd: workspaceDir,
      agentDir: getUserDir(username),
      skillPaths,
      includeDefaults: true,
    });

    const skillsWithContent = result.skills.map((skill) => {
      return {
        name: skill.name,
        description: skill.description,
        filePath: skill.filePath,
        disableModelInvocation: skill.disableModelInvocation,
        scope: skill.sourceInfo?.scope || "project",
        content: skill.content,
      };
    });

    return c.json({ skills: skillsWithContent, diagnostics: result.diagnostics });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

skillsRouter.post("/reset", async (c) => {
  const { username } = getAuthPayload(c);
  try {
    const { DEFAULT_FACTORY_SKILLS } = await import("../core/default-factory-skills");
    const userDir = getUserDir(username);
    const workspaceDir = join(userDir, "workspace");
    const skillsBaseDir = join(workspaceDir, ".agents", "skills");

    for (const [skillKey, skillDef] of Object.entries(DEFAULT_FACTORY_SKILLS)) {
      const skillDir = join(skillsBaseDir, skillKey);
      if (!existsSync(skillDir)) {
        mkdirSync(skillDir, { recursive: true });
      }
      const skillFilePath = join(skillDir, "SKILL.md");
      writeFileSync(skillFilePath, skillDef.content, "utf-8");
    }

    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
