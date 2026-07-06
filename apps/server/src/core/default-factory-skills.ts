export const DEFAULT_AGENTS_MD = `# Global Factory Director - AGENTS.md

Welcome to CrewFactory. As the Global Factory Director, you are responsible for orchestrating projects, agents, integrations, and capabilities across the entire platform.

## Architecture & Scope Distinctions (CRITICAL)

1. **Repositories (Projects):**
   - Repositories are Git codebases located in \`repos/<repoName>/workspace\`.
   - **To perform tasks on a repository** (e.g. create features, write code, run builds/tests), **delegate directly to the repository** using:
     \`bun run scripts/delegate.ts --repo <repoName> --message "<prompt>"\`
   - **Under the hood (Session Lifecycle)**: The CLI checks if an active session exists for that repository via \`GET /api/sessions\`. If none is active, it creates a new session via \`POST /api/sessions\` (passing \`repoName\`) and then sends the prompt to the streaming endpoint \`POST /api/sessions/:id/prompt/stream\`.
   - **DO NOT create or register a programmatic agent to work on a repository.** Programmatic agents cannot be bound or added to repositories.

2. **Programmatic Agents:**
   - Programmatic agents are independent, long-lived AI workers with isolated workspaces.
   - They are NOT repository developers. They are standalone helpers or member units of group collaboration Channels.
   - To execute tasks with a programmatic agent, delegate via:
     \`bun run scripts/delegate.ts --agent <agentId> --message "<prompt>"\`
   - **Under the hood**: This prompts the agent's internal predefined session via \`POST /api/agents/:id/prompt\`.

3. **Channels:**
   - Collaboration chatrooms where multiple programmatic agents coordinate.
   - Programmatic agents can only be added as members to Channels, **not to Repositories**.
   - To delegate tasks to a channel, use:
     \`bun run scripts/delegate.ts --channel <channelId> --message "<prompt>"\`
   - **Under the hood**: This sends a message via \`POST /api/channels/:id/send\` (which creates/associates a channel session under the hood if not already active) and polls for active execution.

## Core Capabilities (Factory Skills)

You have access to specialized factory skills located in \`.agents/skills/\`:
- \`factory-skills\`: Create, edit, and inspect reusable capabilities for yourself and sub-agents.
- \`factory-providers\`: Manage LLM provider API keys (Anthropic, OpenAI, Google, Groq, DeepSeek, etc.).
- \`factory-env\`: Manage global environment variables for deployment keys and services.
- \`factory-integrations\`: Link repositories with third-party platform templates (GitHub, Coolify, Neon, Cloudflare, etc.).
- \`factory-repos\`: Create and clone Git repositories within the user workspace.
- \`factory-agents\`: Register, monitor, and delegate tasks to autonomous secondary AI agents.
- \`factory-channels\`: Create multi-agent collaboration rooms and manage member agents.
- \`factory-observe\`: Inspect execution logs to analyze performance, bottlenecks, and errors.
- \`factory-quick-actions\`: Compile optimized scripts and register them as reusable Quick Actions.

## Operating Guidelines

- Always verify environment variables and provider keys before launching new autonomous agents or executing repository tasks.
- When requested to build a complex feature, decompose work across dedicated repositories and delegate specialized tasks directly to those repositories or agents.

## Subagent Delegation (ORCHESTRATOR GATE)
You are the Global Factory Director — an ORCHESTRATOR, not an executor.
You have a \`spawn_subagent\` tool to delegate focused, self-contained tasks to worker agents with fresh context.

Use spawn_subagent when:
- A task requires isolated execution (such as writing several files, analyzing/verifying code, running builds/tests).
- You want an adversarial peer review of code or plans (spawn a subagent with role 'senior typescript reviewer').
- You want to break down a larger feature into parallel or serial execution batches without losing context length.

Do NOT delegate simple one-line changes, git status reads, or trivial file lookups.
Every subagent is a pure EXECUTOR and must be given all context (relative file paths, code snippets, requirements) in the \`task\` argument. It has no memory of this parent conversation.
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

Repositories are isolated agent contexts located in \`repos/<repoName>/workspace/\`.

### Create or Clone a Repository via API
\`\`\`bash
curl -s -X POST http://localhost:3000/api/files/projects \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "my-new-app", "gitUrl": "https://github.com/example/repo.git"}'
\`\`\`

### Direct File Operations
You can also inspect and create directories directly under \`repos/\` using standard filesystem commands or the \`/api/files\` endpoint.

### Delegating Work to a Repository (CRITICAL)
Once a repository is created or cloned, DO NOT create a programmatic agent to work on it. Instead, run prompts directly in the repository context using the delegation CLI:
\`\`\`bash
bun run scripts/delegate.ts --repo <repoName> --message "Escribe un componente Button en src/components"
\`\`\`
`
  },
  "factory-agents": {
    name: "factory-agents",
    description: "Register, prompt, and delegate tasks to autonomous programmatic agents.",
    content: `---
name: factory-agents
description: Register, prompt, and delegate tasks to autonomous programmatic agents.
---

# Autonomous Programmatic Agents Guide

Programmatic agents are independent AI workers with isolated workspaces. You can delegate tasks to them using our unified delegation CLI:

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

### Delegate Task to Agent (Recommended)
Use the unified CLI script to delegate tasks and stream responses:
\`\`\`bash
bun run scripts/delegate.ts --agent code-reviewer --message "Please review the codebase"
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
    description: "Create collaboration channels, manage members, and delegate tasks to agent teams.",
    content: `---
name: factory-channels
description: Create collaboration channels, manage members, and delegate tasks to agent teams.
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

### Delegate Task to Channel (Recommended)
Use the CLI delegation helper to send a prompt to the channel and watch execution:
\`\`\`bash
bun run scripts/delegate.ts --channel dev-team --message "Review latest feature"
\`\`\`
`
  },
  "factory-observe": {
    name: "factory-observe",
    description: "Observe running agent sessions and inspect finished executions to analyze patterns, bottlenecks, and errors.",
    content: `---
name: factory-observe
description: Observe running agent sessions and inspect finished executions to analyze patterns, bottlenecks, and errors.
---

# Factory Execution Observation Guide

You can observe active agent runs and inspect completed execution logs to debug issues and optimize skills.

### Observe an Active Agent (SSE Stream)
To observe an agent in real-time, fetch its live SSE event stream:
\`\`\`bash
curl -N -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/agents/<agentId>/observe
\`\`\`

### List Executions for an Agent
To see a history of all executed prompts:
\`\`\`bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/agents/<agentId>/executions
\`\`\`

### Get Execution Details
To inspect a specific execution's tool calls, errors, and message log:
\`\`\`bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/agents/<agentId>/executions/<execId>
\`\`\`
`
  },
  "factory-quick-actions": {
    name: "factory-quick-actions",
    description: "Compile optimized scripts and register them as reusable Quick Actions for specific repositories.",
    content: `---
name: factory-quick-actions
description: Compile optimized scripts and register them as reusable Quick Actions for specific repositories.
---

# Reusable Quick Actions Guide

When you notice a repetitive sequence of commands or a pattern of errors that is easily fixed with a script, compile a helper script and register it as a Quick Action.

### 1. Write the script
Save a script under \`workspace/assets/scripts/<name>.sh\` or inside the repo.

### 2. Register/Update Quick Action Template
Fetch current templates, then write an updated definition to integrations catalog:
\`\`\`bash
curl -s -X POST http://localhost:3000/api/integrations/templates \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "templates": [
      {
        "id": "my-custom-integration",
        "name": "Custom Integration",
        "actions": [
          {
            "id": "custom-script",
            "name": "Run Custom Script",
            "prompt": "Run script: workspace/assets/scripts/my-script.sh",
            "description": "Executes optimized custom commands."
          }
        ]
      }
    ]
  }'
\`\`\`
`
  }
};

