import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware, getAuthPayload } from "../middleware/auth";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SaveTemplatesSchema } from "shared";

const DEFAULT_TEMPLATES = [
  {
    id: "github",
    name: "GitHub",
    description: "Manage repository code, create pull requests, check issues, and automate git workflows.",
    requiredEnvVars: ["GITHUB_TOKEN"],
    requiredProjectVars: ["githubRepo"],
    actions: [
      {
        id: "github_create_pr",
        name: "Create Pull Request",
        prompt: "Create a GitHub Pull Request with the current changes. Use the linked repository {githubRepo}. Autofill the description from commits.",
        description: "Creates a pull request on the active GitHub repository."
      },
      {
        id: "github_list_issues",
        name: "List Open Issues",
        prompt: "List the active open issues in the linked GitHub repository: {githubRepo}.",
        description: "Fetch and list active open issues from the repository."
      }
    ]
  },
  {
    id: "coolify",
    name: "Coolify",
    description: "Orchestrate container deployments, manage applications, and check logs on Coolify.",
    requiredEnvVars: ["COOLIFY_API_KEY", "COOLIFY_URL"],
    requiredProjectVars: ["coolifyAppUuid"],
    actions: [
      {
        id: "coolify_deploy",
        name: "Deploy Application",
        prompt: "Deploy the active application to Coolify using application UUID: {coolifyAppUuid}.",
        description: "Trigger a remote build and deployment on Coolify."
      },
      {
        id: "coolify_logs",
        name: "Get App Logs",
        prompt: "Fetch the latest logs for the Coolify application with UUID: {coolifyAppUuid}.",
        description: "Retrieve application runtime logs."
      }
    ]
  },
  {
    id: "neon",
    name: "Neon Postgres",
    description: "Provision databases, manage branches, and retrieve connection strings dynamically.",
    requiredEnvVars: ["NEON_API_KEY"],
    requiredProjectVars: ["neonProject"],
    actions: [
      {
        id: "neon_create_branch",
        name: "Create Neon Branch",
        prompt: "Create a new database branch in Neon for project ID: {neonProject}.",
        description: "Create an isolated development branch database in Neon."
      },
      {
        id: "neon_list_branches",
        name: "List DB Branches",
        prompt: "List all active database branches for Neon project ID: {neonProject}.",
        description: "Retrieve branches configured in the Neon project."
      }
    ]
  },
  {
    id: "cloudflare",
    name: "Cloudflare Wrangler",
    description: "Manage Cloudflare Workers, KV, D1, and deploy websites using Wrangler CLI.",
    requiredEnvVars: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
    requiredProjectVars: ["cloudflareProject"],
    actions: [
      {
        id: "cloudflare_deploy",
        name: "Deploy Worker",
        prompt: "Deploy the project to Cloudflare using Wrangler for project name: {cloudflareProject}.",
        description: "Deploy current worker or page bundle."
      }
    ]
  },
  {
    id: "notion",
    name: "Notion",
    description: "Sync tasks, document specs, and log work directly into Notion pages.",
    requiredEnvVars: ["NOTION_TOKEN"],
    requiredProjectVars: ["notionPageId"],
    actions: [
      {
        id: "notion_sync_tasks",
        name: "Sync Tasks with Notion",
        prompt: "Fetch current tasks and goals from Notion page: {notionPageId} and summarize them.",
        description: "Retrieve tasks directly from your workspace database."
      }
    ]
  },
  {
    id: "vercel",
    name: "Vercel",
    description: "Deploy and host frontend web projects with Vite, React, or Next.js on Vercel.",
    requiredEnvVars: ["VERCEL_TOKEN"],
    requiredProjectVars: ["vercelProjectId"],
    actions: [
      {
        id: "vercel_deploy",
        name: "Deploy to Vercel",
        prompt: "Deploy the application to Vercel. Project ID: {vercelProjectId}.",
        description: "Trigger a production or preview deploy on Vercel."
      }
    ]
  }
];

interface IntegrationsFile {
  templates: typeof DEFAULT_TEMPLATES;
  projectBindings: Record<string, Record<string, string>>;
}

function getIntegrationsPath(username: string): string {
  return join("/tmp/crewfactory", username, "integrations.json");
}

function loadIntegrations(username: string): IntegrationsFile {
  const filePath = getIntegrationsPath(username);
  const userDir = join("/tmp/crewfactory", username);
  if (!existsSync(userDir)) {
    mkdirSync(userDir, { recursive: true });
  }

  if (!existsSync(filePath)) {
    const data: IntegrationsFile = {
      templates: DEFAULT_TEMPLATES,
      projectBindings: {}
    };
    writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    return data;
  }

  try {
    const content = JSON.parse(readFileSync(filePath, "utf-8"));
    return {
      templates: content.templates || DEFAULT_TEMPLATES,
      projectBindings: content.projectBindings || {}
    };
  } catch {
    return {
      templates: DEFAULT_TEMPLATES,
      projectBindings: {}
    };
  }
}

function saveIntegrations(username: string, data: IntegrationsFile) {
  const filePath = getIntegrationsPath(username);
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export const integrationsRouter = new Hono();

integrationsRouter.use("/*", authMiddleware);

integrationsRouter.get("/templates", (c) => {
  const { username } = getAuthPayload(c);
  const data = loadIntegrations(username);
  return c.json({ templates: data.templates });
});

integrationsRouter.post(
  "/templates",
  zValidator("json", SaveTemplatesSchema),
  (c) => {
    const { username } = getAuthPayload(c);
    const { templates } = c.req.valid("json");

    const data = loadIntegrations(username);
    data.templates = templates as typeof DEFAULT_TEMPLATES;
    saveIntegrations(username, data);

    return c.json({ success: true, templates: data.templates });
  }
);

integrationsRouter.get("/bindings/:projectName", (c) => {
  const projectName = c.req.param("projectName");
  const { username } = getAuthPayload(c);
  const data = loadIntegrations(username);
  const bindings = data.projectBindings[projectName] || {};
  return c.json({ bindings });
});

integrationsRouter.post(
  "/bindings/:projectName",
  zValidator("json", z.record(z.string(), z.string())),
  (c) => {
    const projectName = c.req.param("projectName");
    const { username } = getAuthPayload(c);
    const newBindings = c.req.valid("json");

    const data = loadIntegrations(username);
    data.projectBindings[projectName] = newBindings;
    saveIntegrations(username, data);

    return c.json({ success: true, bindings: data.projectBindings[projectName] });
  }
);
