import { Hono } from "hono";
import { loadSkills } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { authMiddleware, getAuthPayload } from "../middleware/auth";
import { getResolvedSkillPaths } from "../pi/session-manager";

export const skillsRouter = new Hono();

skillsRouter.use("/*", authMiddleware);

skillsRouter.get("/", async (c) => {
  const { username } = getAuthPayload(c);

  try {
    const workspaceDir = `/tmp/crewfactory/${username}/workspace`;
    const skillPaths = getResolvedSkillPaths(workspaceDir);
    const result = loadSkills({
      cwd: workspaceDir,
      agentDir: `/tmp/crewfactory/${username}`,
      skillPaths,
      includeDefaults: true,
    });

    const skillsWithContent = result.skills.map((skill) => {
      let content = "";
      if (existsSync(skill.filePath)) {
        try {
          content = readFileSync(skill.filePath, "utf-8");
        } catch (e) {
          console.error(`Failed to read skill file ${skill.filePath}:`, e);
        }
      }
      return {
        name: skill.name,
        description: skill.description,
        filePath: skill.filePath,
        disableModelInvocation: skill.disableModelInvocation,
        scope: skill.sourceInfo?.scope || "project",
        content,
      };
    });

    return c.json({ skills: skillsWithContent, diagnostics: result.diagnostics });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
