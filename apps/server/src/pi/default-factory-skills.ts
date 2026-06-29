export const DEFAULT_AGENTS_MD = `# Global Factory Director - AGENTS.md

Welcome to CrewFactory. As the Global Factory Director, you are responsible for orchestrating projects, agents, integrations, and capabilities across the entire platform.

## Architecture & Responsibilities

1. **Global Mode vs. Repo Mode:**
   - **Global Mode (Root CWD):** Managing factory-wide infrastructure, creating repositories, configuring LLM providers, setting environment variables, registering autonomous programmatic agents, and orchestrating multi-agent collaboration channels.
   - **Repo Mode:** Focused development within specific Git repositories inside \`workspace/repos/<repoName>\`.

2. **Core Capabilities (Factory Skills):**
   You have access to specialized factory skills located in \`.agents/skills/\`:
   - \`factory-skills\`: Create, edit, and inspect reusable capabilities for yourself and sub-agents.
   - \`factory-providers\`: Manage LLM provider API keys (Anthropic, OpenAI, Google, Groq, DeepSeek, etc.).
   - \`factory-env\`: Manage global environment variables for deployment keys and services.
   - \`factory-integrations\`: Link repositories with third-party platform templates (GitHub, Coolify, Vercel, Neon, Cloudflare, Notion).
   - \`factory-repos\`: Create and clone Git repositories within the user workspace.
   - \`factory-agents\`: Register, monitor, and control autonomous secondary AI agents.
   - \`factory-channels\`: Create multi-agent collaboration rooms and manage message routing.

3. **Operating Guidelines:**
   - Always verify environment variables and provider keys before launching new autonomous agents.
   - When requested to build a complex feature, decompose work across dedicated repositories and delegate specialized tasks to programmatic agents via channels.
`;

export const DEFAULT_FACTORY_SKILLS: Record<string, { name: string; description: string; content: string }> = {
  "factory-skills": {
    name: "factory-skills",
    description: "Create, inspect, and update custom capabilities and skills in .agents/skills/ for agents across the factory.",
    content: `---
name: factory-skills
description: Create, inspect, and update custom capabilities and skills in .agents/skills/ for agents across the factory.
---

# Skill Management Guide

To create a new custom skill for agents in CrewFactory:

1. Create a directory under \`.agents/skills/<skill-id>\`.
2. Create a \`SKILL.md\` file inside that directory.
3. Include YAML frontmatter with \`name\` and \`description\`.
4. Add detailed markdown instructions and guidelines for the agent.

### Example SKILL.md Template
\`\`\`markdown
---
name: my-custom-skill
description: Performs automated deployment checks.
---

# My Custom Skill
Instructions for executing this skill...
\`\`\`
`
  },
  "factory-providers": {
    name: "factory-providers",
    description: "Manage LLM provider authentication and API keys dynamically via HTTP endpoints.",
    content: `---
name: factory-providers
description: Manage LLM provider authentication and API keys dynamically via HTTP endpoints.
---

# Provider API Keys Management

You can inspect configured providers and set API keys for Anthropic, OpenAI, Google, Groq, DeepSeek, Mistral, and other supported providers.

### List Providers
\`\`\`bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/providers
\`\`\`

### Set Provider API Key
\`\`\`bash
curl -s -X POST http://localhost:3000/api/providers/anthropic/key \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"apiKey": "sk-ant-api03-..."}'
\`\`\`

### Revoke Provider Key
\`\`\`bash
curl -s -X DELETE http://localhost:3000/api/providers/anthropic/key \\
  -H "Authorization: Bearer $TOKEN"
\`\`\`
`
  },
  "factory-env": {
    name: "factory-env",
    description: "Manage global environment variables across the factory for external tools and services.",
    content: `---
name: factory-env
description: Manage global environment variables across the factory for external tools and services.
---

# Global Environment Variables Management

Environment variables are stored securely per user and made available to agent sessions and sub-processes.

### List Environment Variables
\`\`\`bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/env?reveal=true
\`\`\`

### Set a Single Environment Variable
\`\`\`bash
curl -s -X POST http://localhost:3000/api/env \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"key": "GITHUB_TOKEN", "value": "ghp_xxxxxxxxxxxx"}'
\`\`\`

### Bulk Update Environment Variables
\`\`\`bash
curl -s -X PUT http://localhost:3000/api/env \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"variables": {"COOLIFY_API_KEY": "secret", "NEON_API_KEY": "secret"}}'
\`\`\`
`
  },
  "factory-integrations": {
    name: "factory-integrations",
    description: "Manage deployment and database platform templates and bind repositories to integration settings.",
    content: `---
name: factory-integrations
description: Manage deployment and database platform templates and bind repositories to integration settings.
---

# Platform Integrations & Binding Guide

Integrations bind specific repositories to deployment targets like GitHub, Coolify, Neon Postgres, Cloudflare Wrangler, Vercel, and Notion.

### Fetch Integration Templates
\`\`\`bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/integrations/templates
\`\`\`

### Get Bindings for a Repository
\`\`\`bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/integrations/bindings/my-app
\`\`\`

### Bind Repository to Deployment Variables
\`\`\`bash
curl -s -X POST http://localhost:3000/api/integrations/bindings/my-app \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"coolifyAppUuid": "app-uuid-1234", "githubRepo": "owner/my-app"}'
\`\`\`
`
  },
  "factory-repos": {
    name: "factory-repos",
    description: "Create new local projects or clone remote Git repositories into the user workspace.",
    content: `---
name: factory-repos
description: Create new local projects or clone remote Git repositories into the user workspace.
---

# Repository Management Guide

Repositories are isolated agent contexts located in \`workspace/repos/\`.

### Create or Clone a Repository via API
\`\`\`bash
curl -s -X POST http://localhost:3000/api/files/projects \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "my-new-app", "gitUrl": "https://github.com/example/repo.git"}'
\`\`\`

### Direct File Operations
You can also inspect and create directories directly under \`workspace/repos/\` using standard filesystem commands or the \`/api/files\` endpoint.
`
  },
  "factory-agents": {
    name: "factory-agents",
    description: "Register, prompt, monitor, and stop autonomous programmatic agents.",
    content: `---
name: factory-agents
description: Register, prompt, monitor, and stop autonomous programmatic agents.
---

# Autonomous Programmatic Agents Guide

Programmatic agents are independent AI workers with isolated execution loops and ports.

### List Active Agents
\`\`\`bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/agents
\`\`\`

### Register a New Agent
\`\`\`bash
curl -s -X POST http://localhost:3000/api/agents \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "id": "code-reviewer",
    "name": "Code Reviewer Agent",
    "role": "reviewer",
    "systemPrompt": "You are a senior code reviewer enforcing clean architecture.",
    "model": "anthropic/claude-3-5-sonnet-20241022"
  }'
\`\`\`

### Send Prompt to Agent
\`\`\`bash
curl -s -X POST http://localhost:3000/api/agents/code-reviewer/prompt \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Please review the latest commit."}'
\`\`\`

### Stop an Agent
\`\`\`bash
curl -s -X DELETE http://localhost:3000/api/agents/code-reviewer \\
  -H "Authorization: Bearer $TOKEN"
\`\`\`
`
  },
  "factory-channels": {
    name: "factory-channels",
    description: "Create multi-agent collaboration channels and orchestrate agent team discussions.",
    content: `---
name: factory-channels
description: Create multi-agent collaboration channels and orchestrate agent team discussions.
---

# Multi-Agent Collaboration Channels Guide

Channels enable autonomous coordination among multiple programmatic agents.

### List Channels
\`\`\`bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/channels
\`\`\`

### Create a Collaboration Channel
\`\`\`bash
curl -s -X POST http://localhost:3000/api/channels \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"id": "dev-team", "name": "Development Team", "description": "Channel for frontend and backend agents."}'
\`\`\`

### Add Member Agent to Channel
\`\`\`bash
curl -s -X POST http://localhost:3000/api/channels/dev-team/members \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"agentId": "code-reviewer", "replyMode": "auto"}'
\`\`\`

### Send Message to Channel
\`\`\`bash
curl -s -X POST http://localhost:3000/api/channels/dev-team/send \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Team, please review the release candidate."}'
\`\`\`
`
  }
};
