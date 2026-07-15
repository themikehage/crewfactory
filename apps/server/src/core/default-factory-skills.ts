
export const DEFAULT_AGENTS_MD = `# Global Factory Director - AGENTS.md

Welcome to CrewFactory. As the Global Factory Director, you are responsible for orchestrating projects, agents, integrations, and capabilities across the entire platform.

## Architecture & Scope Distinctions (CRITICAL)

1. **Projects:**
   - Projects are Git codebases located in the user's projects workspace directory.
   - From your global CWD (user workspace), projects are at \`../projects/<projectId>/workspace/\`.
   - **To perform tasks on a project** (e.g. create features, write code, run builds/tests), **delegate directly to the project** using the native tool:
     \`delegate_task(targetType: "project", targetId: "<projectName>", task: "<prompt>")\`
   - **DO NOT run bash commands or curl requests** to trigger execution or prompt agents/projects.
   - **DO NOT create or register a programmatic agent to work on a project.** Programmatic agents cannot be bound or added to projects.

2. **Programmatic Agents:**
   - Programmatic agents are independent, long-lived AI workers with isolated workspaces.
   - They are NOT project developers. They are standalone helpers or member units of group collaboration Channels.
   - To execute tasks with a programmatic agent, delegate using the native tool:
     \`delegate_task(targetType: "agent", targetId: "<agentId>", task: "<prompt>")\`
   - **DO NOT use curl or invoke REST endpoints** to prompt agents. Always use \`delegate_task\`.

3. **Channels:**
   - Collaboration chatrooms where multiple programmatic agents coordinate.
   - Programmatic agents can only be added as members to Channels, **not to Projects**.
   - To delegate tasks to a channel, use the native tool:
     \`delegate_task(targetType: "channel", targetId: "<channelId>", task: "<prompt>")\`
   - **DO NOT use curl or dispatch messages via REST.** Always use \`delegate_task\`.

## Core Capabilities (Factory Skills)

You have access to specialized factory skills located in \`.agents/skills/\`:
- \`factory-skills\`: Create, edit, and inspect reusable capabilities for yourself and sub-agents.
- \`factory-providers\`: Manage LLM provider API keys (Anthropic, OpenAI, Google, Groq, DeepSeek, etc.).
- \`factory-env\`: Manage global environment variables for deployment keys and services.
- \`factory-integrations\`: Link projects with third-party platform templates (GitHub, Coolify, Neon, Cloudflare, etc.).
- \`factory-projects\`: Create and clone Git repositories within the user workspace.
- \`factory-agents\`: Register, monitor, and delegate tasks to autonomous secondary AI agents.
- \`factory-channels\`: Create multi-agent collaboration rooms and manage member agents.
- \`factory-pipelines\`: Create, run, and monitor deterministic linear execution pipelines (lint → test → build → deploy).
- \`factory-observe\`: Inspect execution logs to analyze performance, bottlenecks, and errors.
- \`factory-quick-actions\`: Compile optimized scripts and register them as reusable Quick Actions.
- \`factory-self-improvement\`: Run a structured self-evaluation suite, exercise each factory capability, and generate an actionable improvement report with skill and prompt update recommendations.

## Operating Guidelines

- Always verify environment variables and provider keys before launching new autonomous agents or executing project tasks.
- When requested to build a complex feature, decompose work across dedicated projects and delegate specialized tasks directly to those projects or agents.

## Task Planning & Decomposition (decompose_tasks)
If the user requests a complex, multi-step implementation or feature:
- First, break down the objective into a structured array of tasks, specifying their IDs ("t1", "t2", etc.), descriptive titles, detailed self-contained instructions, and depends_on dependencies.
- ALWAYS call the \`decompose_tasks(objective: "...", tasks: [...])\` tool to register your structured plan. Do not perform any execution actions before registering the plan.
- Walk through the tasks in the plan sequentially, respecting the \`depends_on\` dependencies.
- Explain to the user which task you are executing before performing the changes.
- Once a task is complete, summarize the outcome before moving to the next.
- If a task fails, re-plan the remaining steps and register the new plan by calling \`decompose_tasks\` again.

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
  "factory-pipelines": {
    name: "factory-pipelines",
    description: "Create, run, and monitor deterministic linear execution pipelines.",
    content: `---
name: factory-pipelines
description: Create, run, and monitor deterministic linear execution pipelines.
---

# Linear Pipelines Guide

Pipelines are deterministic, linear sequences of stages. Unlike channels (which are collaborative and conversational), pipelines execute stages strictly in order. A failure at any stage stops the pipeline immediately (fail-fast).

Always use the \`manage_pipelines\` tool to execute and debug pipelines.

## Stage Types
- **script**: Runs a bash script directly. No LLM. Extremely fast and deterministic.
- **agent**: Delegates to an agent with a prompt, using LLM reasoning.

## Actions available in \`manage_pipelines\`

### 1. Create or Update a Pipeline (upsert)
Call \`manage_pipelines\` with \`action: "upsert"\`, \`id: "pipeline-id"\`. You can specify stages and save scripts inline:

\`\`\`json
{
  "action": "upsert",
  "id": "my-pipeline",
  "params": {
    "name": "My Pipeline",
    "description": "Lint and test",
    "stages": [
      {
        "id": "lint",
        "name": "Run Linter",
        "type": "script",
        "script": "lint.sh",
        "timeoutMs": 60000,
        "outputSchema": [
          { "name": "passed", "type": "boolean", "description": "true if lint passed" }
        ]
      },
      {
        "id": "report",
        "name": "Report Results",
        "type": "agent",
        "prompt": "Review the lint result: {{stages.lint.output.passed}}. Report your recommendation."
      }
    ],
    "scripts": {
      "lint.sh": "#!/bin/bash\\nset -e\\npnpm lint\\necho '---OUTPUT---'\\necho '{\\\"passed\\\":true}'\\necho '---END OUTPUT---'"
    }
  }
}
\`\`\`

### 2. Run a Pipeline (run)
Call \`manage_pipelines(action: "run", id: "my-pipeline")\` to trigger execution in the background (fire-and-forget). This returns a \`runId\` immediately:
\`\`\`json
{ "runId": "run_abc123", "message": "Pipeline started" }
\`\`\`

### 3. Check Run Summary (get)
Call \`manage_pipelines(action: "get", id: "my-pipeline/runs/run_abc123")\` to get a quick summary.

### 4. Debug a Failed Run (get_run)
If a run fails, call \`manage_pipelines\` with \`action: "get_run"\` and \`params: { "runId": "run_abc123" }\` to get a detailed status containing the full \`rawOutput\` and \`stderr\` of each stage.

### 5. Inspect and Patch Scripts
- Read script: \`manage_pipelines(action: "read_script", id: "my-pipeline", params: { "scriptName": "lint.sh" })\`
- Patch script: \`manage_pipelines(action: "patch_script", id: "my-pipeline", params: { "scriptName": "lint.sh", "content": "#!/bin/bash\\n..." })\`

### 6. Abort a Run
Call \`manage_pipelines(action: "abort", id: "my-pipeline", params: { "runId": "run_abc123" })\` to cancel execution.

## Common Debugging Workflow
1. Check failure: \`manage_pipelines(action: "get_run", id: "my-pipeline", params: { "runId": "run_abc123" })\` to read logs.
2. Read the failing script: \`manage_pipelines(action: "read_script", id: "my-pipeline", params: { "scriptName": "lint.sh" })\`.
3. Patch the script: \`manage_pipelines(action: "patch_script", id: "my-pipeline", params: { "scriptName": "lint.sh", "content": "fixed-content" })\`.
4. Re-run execution: \`manage_pipelines(action: "run", id: "my-pipeline")\`.
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
wget -qO- --header="Authorization: Bearer $TOKEN" http://localhost:3000/api/providers
\`\`\`

### Set Provider API Key
\`\`\`bash
wget -qO- --header="Authorization: Bearer $TOKEN" \
  --header="Content-Type: application/json" \
  --post-data='{"apiKey": "sk-ant-api03-..."}' \
  http://localhost:3000/api/providers/anthropic/key
\`\`\`

### Revoke Provider Key
\`\`\`bash
wget -qO- --header="Authorization: Bearer $TOKEN" \
  --method=DELETE \
  http://localhost:3000/api/providers/anthropic/key
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
# List variables (values will be masked as ••••••••)
wget -qO- --header="Authorization: Bearer $TOKEN" http://localhost:3000/api/env
\`\`\`

### Reveal a Specific Variable
\`\`\`bash
# Reveal the value of a specific environment variable (logged for audit)
wget -qO- --header="Authorization: Bearer $TOKEN" http://localhost:3000/api/env/reveal/GITHUB_TOKEN
\`\`\`

### Set a Single Environment Variable
\`\`\`bash
wget -qO- --header="Authorization: Bearer $TOKEN" \
  --header="Content-Type: application/json" \
  --post-data='{"key": "GITHUB_TOKEN", "value": "ghp_xxxxxxxxxxxx"}' \
  http://localhost:3000/api/env
\`\`\`

### Bulk Update Environment Variables
\`\`\`bash
wget -qO- --header="Authorization: Bearer $TOKEN" \
  --header="Content-Type: application/json" \
  --method=PUT \
  --body-data='{"variables": {"COOLIFY_API_KEY": "secret", "NEON_API_KEY": "secret"}}' \
  http://localhost:3000/api/env
\`\`\`
`
  },
  "factory-integrations": {
    name: "factory-integrations",
    description: "Manage deployment and database platform templates and bind projects to integration settings.",
    content: `---
name: factory-integrations
description: Manage deployment and database platform templates and bind projects to integration settings.
---

# Platform Integrations & Binding Guide

Integrations bind specific projects to deployment targets like GitHub, Coolify, Neon Postgres, Cloudflare Wrangler, Vercel, and Notion.

### Fetch Integration Templates
\`\`\`bash
wget -qO- --header="Authorization: Bearer $TOKEN" http://localhost:3000/api/integrations/templates
\`\`\`

### Get Bindings for a Project
\`\`\`bash
wget -qO- --header="Authorization: Bearer $TOKEN" http://localhost:3000/api/integrations/bindings/my-app
\`\`\`

### Bind Project to Deployment Variables
\`\`\`bash
wget -qO- --header="Authorization: Bearer $TOKEN" \
  --header="Content-Type: application/json" \
  --post-data='{"coolifyAppUuid": "app-uuid-1234", "githubRepo": "owner/my-app"}' \
  http://localhost:3000/api/integrations/bindings/my-app
\`\`\`
`
  },
  "factory-projects": {
    name: "factory-projects",
    description: "Create new local projects or clone remote Git repositories into the user workspace.",
    content: `---
name: factory-projects
description: Create new local projects or clone remote Git repositories into the user workspace.
---

# Project Management Guide

Projects are isolated agent contexts. The absolute path structure is:
- User base: user data directory
- Projects root: user projects directory
- Each project workspace: user projects workspace

Your current working directory (CWD) in global mode is your user workspace directory.
To reference projects from your CWD, use the relative path \`../projects/<projectId>/workspace/\`.

### Create or Clone a Project via API (REQUIRED — do NOT use mkdir/git init manually)
\`\`\`bash
wget -qO- --header="Authorization: Bearer $TOKEN" \
  --header="Content-Type: application/json" \
  --post-data='{"name": "my-new-app", "cloneUrl": "https://github.com/example/repo.git"}' \
  http://localhost:3000/api/workspace-projects
\`\`\`

To create an empty project (no cloneUrl):
\`\`\`bash
wget -qO- --header="Authorization: Bearer $TOKEN" \
  --header="Content-Type: application/json" \
  --post-data='{"name": "my-new-app"}' \
  http://localhost:3000/api/workspace-projects
\`\`\`

### Delegating Work to a Project (CRITICAL)
Once a project is created or cloned, DO NOT create a programmatic agent to work on it. Instead, run prompts directly in the project context using the delegation CLI:
\`\`\`bash
bun run scripts/delegate.ts --project <projectName> --message "Escribe un componente Button en src/components"
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
wget -qO- --header="Authorization: Bearer $TOKEN" http://localhost:3000/api/agents
\`\`\`

### Register a New Agent
\`\`\`bash
wget -qO- --header="Authorization: Bearer $TOKEN" \
  --header="Content-Type: application/json" \
  --post-data='{
    "id": "code-reviewer",
    "name": "Code Reviewer Agent",
    "role": "reviewer",
    "systemPrompt": "You are a senior code reviewer enforcing clean architecture.",
    "model": "anthropic/claude-3-5-sonnet-20241022"
  }' \
  http://localhost:3000/api/agents
\`\`\`

### Delegate Task to Agent (Recommended)
Always use the native \`delegate_task\` tool to prompt and delegate tasks to programmatic agents:
\`delegate_task(targetType: "agent", targetId: "code-reviewer", task: "Please review the codebase")\`
DO NOT use curl or bash command scripts to communicate with other agents.

### Stop an Agent
\`\`\`bash
wget -qO- --header="Authorization: Bearer $TOKEN" \
  --method=DELETE \
  http://localhost:3000/api/agents/code-reviewer
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
wget -qO- --header="Authorization: Bearer $TOKEN" http://localhost:3000/api/channels
\`\`\`

### Create a Collaboration Channel
\`\`\`bash
wget -qO- --header="Authorization: Bearer $TOKEN" \
  --header="Content-Type: application/json" \
  --post-data='{"id": "dev-team", "name": "Development Team", "description": "Channel for frontend and backend agents."}' \
  http://localhost:3000/api/channels
\`\`\`

### Add Member Agent to Channel
\`\`\`bash
wget -qO- --header="Authorization: Bearer $TOKEN" \
  --header="Content-Type: application/json" \
  --post-data='{"agentId": "code-reviewer", "replyMode": "auto"}' \
  http://localhost:3000/api/channels/dev-team/members
\`\`\`

### Delegate Task to Channel (Recommended)
Always use the native \`delegate_task\` tool to prompt and delegate tasks to channels:
\`delegate_task(targetType: "channel", targetId: "dev-team", task: "Review latest feature")\`
DO NOT use curl or bash command scripts.
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
wget -qO- --header="Authorization: Bearer $TOKEN" http://localhost:3000/api/agents/<agentId>/observe
\`\`\`

### List Executions for an Agent
To see a history of all executed prompts:
\`\`\`bash
wget -qO- --header="Authorization: Bearer $TOKEN" http://localhost:3000/api/agents/<agentId>/executions
\`\`\`

### Get Execution Details
To inspect a specific execution's tool calls, errors, and message log:
\`\`\`bash
wget -qO- --header="Authorization: Bearer $TOKEN" http://localhost:3000/api/agents/<agentId>/executions/<execId>
\`\`\`
`
  },
  "factory-quick-actions": {
    name: "factory-quick-actions",
    description: "Compile optimized scripts and register them as reusable Quick Actions for specific projects.",
    content: `---
name: factory-quick-actions
description: Compile optimized scripts and register them as reusable Quick Actions for specific projects.
---

# Reusable Quick Actions Guide

When you notice a repetitive sequence of commands or a pattern of errors that is easily fixed with a script, compile a helper script and register it as a Quick Action.

### 1. Write the script
Save a script under \`workspace/assets/scripts/<name>.sh\` or inside the repo.

### 2. Register/Update Quick Action Template
Fetch current templates, then write an updated definition to integrations catalog:
\`\`\`bash
wget -qO- --header="Authorization: Bearer $TOKEN" \
  --header="Content-Type: application/json" \
  --post-data='{
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
  }' \
  http://localhost:3000/api/integrations/templates
\`\`\`
`
  },
  "factory-sessions": {
    name: "factory-sessions",
    description: "List, inspect, delete, and analyze agent sessions and execution logs across projects, agents, channels, and experiments.",
    content: `---
name: factory-sessions
description: List, inspect, delete, and analyze agent sessions and execution logs across projects, agents, channels, and experiments.
---

# Factory Sessions Management & Analysis Guide

As the Global Factory Director, you can manage the lifecycle of all active and historic sessions, send prompts to specific sessions, and analyze their logs for performance, error tracking, and benchmark metrics.

All actions are performed via Hono REST endpoints and require the \`Authorization: Bearer $TOKEN\` header.

## 1. Session Discovery

### List All Sessions
\`\`\`bash
wget -qO- --header="Authorization: Bearer $TOKEN" http://localhost:3000/api/sessions
\`\`\`

### Filter Sessions by Entity Type (using bun's JSON parser)
\`\`\`bash
# By Project:
wget -qO- --header="Authorization: Bearer $TOKEN" http://localhost:3000/api/sessions | bun -e "
const data = await Bun.stdin.text();
const sessions = JSON.parse(data).sessions || [];
sessions.filter(s => s.projectName).forEach(s => console.log(s.id, s.name));
"
\`\`\`

\`\`\`bash
# By Programmatic Agent:
wget -qO- --header="Authorization: Bearer $TOKEN" http://localhost:3000/api/sessions | bun -e "
const data = await Bun.stdin.text();
const sessions = JSON.parse(data).sessions || [];
sessions.filter(s => s.agentId).forEach(s => console.log(s.id, s.name));
"
\`\`\`

\`\`\`bash
# By Channel:
wget -qO- --header="Authorization: Bearer $TOKEN" http://localhost:3000/api/sessions | bun -e "
const data = await Bun.stdin.text();
const sessions = JSON.parse(data).sessions || [];
sessions.filter(s => s.channelId).forEach(s => console.log(s.id, s.name));
"
\`\`\`

---

## 2. Session Interaction

### Send prompt to a Session (Awaited REST)
\`\`\`bash
wget -qO- --header="Authorization: Bearer $TOKEN" \
  --header="Content-Type: application/json" \
  --post-data='{"message": "Please run typecheck on apps/server"}' \
  http://localhost:3000/api/sessions/<session-id>/prompt
\`\`\`

### Send prompt with Real-time Streaming (CLI)
You can delegate prompt execution using the CLI helper, which automatically resolves or creates the underlying session:
\`\`\`bash
bun run scripts/delegate.ts --project <projectName> --message "<prompt>"
bun run scripts/delegate.ts --agent <agentId> --message "<prompt>"
bun run scripts/delegate.ts --channel <channelId> --message "<prompt>"
\`\`\`

---

## 3. Session Diagnostics & Error Analysis

### Fetch Message History
\`\`\`bash
wget -qO- --header="Authorization: Bearer $TOKEN" http://localhost:3000/api/sessions/<session-id>/messages
\`\`\`

### Troubleshooting Patterns
When checking for failures, parse the message array:
- **Agent Errors:** Find objects with \`type: "agent_error"\` to inspect Hono server or provider execution crashes.
- **Tool Failures:** Find tool calls within messages or history events where \`isError: true\` or the result contains exception stacks.
- **Execution Bottlenecks:** Measure the latency between \`tool_execution_start\` and \`tool_execution_end\` events to find hanging bash operations or heavy bundle builds.

---

## 4. Experiment Introspection
To inspect debates and variants in laboratory simulations:

1. **List all experiments:**
   \`\`\`bash
   wget -qO- --header="Authorization: Bearer $TOKEN" http://localhost:3000/api/experiments
   \`\`\`
2. **Fetch active sessions from variants:**
   Filter the experiment JSON to find:
   - Baseline single-run session: \`variants.single.activeSessionId\`
   - Collaborative no-leader session: \`variants.multiNoLeader.activeSessionId\`
   - Hierarchical debate session: \`variants.multiWithLeader.activeSessionId\`
3. **Read logs:** Fetch messages for those session IDs using the standard \`/api/sessions/:id/messages\` route to compare agent statements and judge reasonings.

---

## 5. Session Cleanup
Delete any stalled or redundant session:
\`\`\`bash
wget -qO- --header="Authorization: Bearer $TOKEN" \
  --method=DELETE \
  http://localhost:3000/api/sessions/<session-id>
\`\`\`
`
  },
  "factory-self-improvement": {
    name: "factory-self-improvement",
    description: "Run a structured self-evaluation suite that exercises each factory capability with real prompts, then analyzes results to produce an actionable improvement report.",
    content: `---
name: factory-self-improvement
description: Run a structured self-evaluation suite that exercises each factory capability with real prompts, then analyzes results to produce an actionable improvement report.
---

# Factory Self-Improvement Protocol

This skill runs a structured evaluation of the Global Factory Director's capabilities. It targets specific factory skills to run test prompts, collects results, and produces an actionable improvement report.

### Step 0: User Consultation (MANDATORY FIRST STEP)
Before executing any exercises, you MUST ask the user which capability or area they would like to evaluate and improve (e.g., environment/providers, project management/delegation, subagent spawning, agents, channels, custom skills, or session introspection), or if they prefer to run the full diagnostic suite.
Only proceed to execute the corresponding exercise(s) after receiving the user's choice.

---

## Phase 1 — Execution Suite

Execute the chosen exercise(s) below. After each one, record: what happened, whether it succeeded, and any friction or unexpected behavior you encountered.

---

### Exercise 1 — Environment Introspection (factory-env)

**Prompt to execute:**
> "List all configured environment variables and summarize how many are set. Do not reveal values."

**Expected outcome:** A bash call to \`GET /api/env\` returns a JSON array. The agent summarizes the count and key names without exposing secrets.

**What to check:** Did the agent use curl correctly with the Bearer token? Did it expose any values accidentally? Was the output clear and concise?

---

### Exercise 2 — Provider Status Check (factory-providers)

**Prompt to execute:**
> "List all configured LLM providers and tell me which ones are authenticated (have an API key set)."

**Expected outcome:** A call to \`GET /api/providers\` returns a list with \`isConfigured\` flags. The agent summarizes which providers are ready.

**What to check:** Did the agent distinguish between configured and unconfigured providers? Did it avoid setting or modifying any keys without being asked?

---

### Exercise 3 — Project Creation (factory-projects)

**Prompt to execute:**
> "Create an empty project named 'self-eval-test' in my workspace."

**Expected outcome:** The agent calls \`POST /api/workspace-projects\` with \`name: "self-eval-test"\` (no cloneUrl). Returns the new project's ID.

**What to check:** Did the agent use the API correctly instead of running \`mkdir\` or \`git init\` in bash? Did it confirm the project was created and provide the ID?

---

### Exercise 4 — Project Delegation (factory-projects + delegate_task)

**Prompt to execute:**
> "Delegate this task to the project 'self-eval-test': Write a file called README.md with a single line: 'Self-evaluation test project'."

**Expected outcome:** The agent uses \`delegate_task(targetType: "project", targetId: "self-eval-test", task: "...")\`. The subagent executes and the file is created.

**What to check:** Did the agent use \`delegate_task\` instead of running bash commands itself? Did it verify the outcome by reading the file afterward?

---

### Exercise 5 — Spawn Subagent (spawn_subagent)

**Prompt to execute:**
> "Spawn a subagent with the role of 'TypeScript code verifier'. Give it this task: list all .ts files under apps/server/src/core/ and count them. Return the count."

**Expected outcome:** The agent calls \`spawn_subagent\` with an appropriate system prompt and task. The subagent returns a result. The parent agent extracts the count from the envelope response (\`status\`, \`executive_summary\`, \`artifacts\`).

**What to check:** Did the parent parse the subagent's response correctly? Was the envelope properly structured? Did the parent report the result to the user without re-running the task?

---

### Exercise 6 — Programmatic Agent Registration (factory-agents)

**Prompt to execute:**
> "Register a new temporary programmatic agent with id 'eval-worker', name 'Eval Worker', role 'evaluator', and use the default configured model. Give it this system prompt: 'You are a code evaluation assistant. Reply concisely in English.'"

**Expected outcome:** The agent calls \`POST /api/agents\` with the correct body. Returns the agent entry.

**What to check:** Did the agent construct the JSON body correctly? Did it identify the default model from the modelRegistry or provider config? Did it avoid hardcoding a model string?

---

### Exercise 7 — Agent Delegation (factory-agents + delegate_task)

**Prompt to execute:**
> "Delegate this task to the agent 'eval-worker': Summarize what the file apps/server/src/core/agent-utils.ts does in 2 sentences."

**Expected outcome:** The agent calls \`delegate_task(targetType: "agent", targetId: "eval-worker", task: "...")\`. The eval-worker responds with a 2-sentence summary.

**What to check:** Did the agent use \`delegate_task\` correctly? Did it return the delegated agent's response clearly to the user?

---

### Exercise 8 — Channel Creation (factory-channels)

**Prompt to execute:**
> "Create a collaboration channel named 'eval-channel' with a description 'Temporary evaluation channel'."

**Expected outcome:** The agent calls \`POST /api/channels\` with the correct body. Returns the channel ID.

**What to check:** Did the agent create the channel via the API? Did it confirm the channel ID to the user?

---

### Exercise 9 — Skill Creation (factory-skills)

**Prompt to execute:**
> "Create a new skill called 'hello-world-skill'. The skill description should be 'A minimal test skill.' The SKILL.md content should just say: '# Hello World. This skill does nothing. It is a test.'"

**Expected outcome:** The agent creates the directory \`.agents/skills/hello-world-skill/\` and writes a \`SKILL.md\` file with valid YAML frontmatter (\`name\` and \`description\` fields) and the provided content.

**What to check:** Did the agent use the correct path relative to the global workspace CWD? Is the YAML frontmatter valid?

---

### Exercise 10 — Session Introspection (factory-sessions)

**Prompt to execute:**
> "List the 5 most recently updated sessions and summarize their names, statuses, and whether they belong to a project or agent."

**Expected outcome:** The agent calls \`GET /api/sessions\` and parses the response, producing a readable summary table or list.

**What to check:** Did the agent handle pagination or empty results gracefully? Did it avoid fetching full message histories unnecessarily?

---

## Phase 2 — Analysis

After completing all exercises, reflect on the entire execution trace:

1. **Failures:** Which exercises failed entirely or produced incorrect output? What was the root cause?
2. **Friction Points:** Where did you hesitate, make an extra API call to verify something, or correct a mistake mid-execution?
3. **Skill Gaps:** For each exercise, is the corresponding factory skill (\`factory-env\`, \`factory-projects\`, etc.) clear enough? What information was missing or ambiguous?
4. **Prompt Clarity:** Were the exercise prompts unambiguous? Which prompts could be reworded to produce better first-attempt results?
5. **Tool Misuse Patterns:** Did you default to bash/curl when a native tool (\`delegate_task\`, \`spawn_subagent\`) should have been used instead?

---

## Phase 3 — Improvement Report

Produce a structured report in this exact format:

\`\`\`
# Self-Improvement Report — [Date]

## Summary
[1-2 sentence overview of the evaluation run]

## Exercise Results
| Exercise | Status | Notes |
|----------|--------|-------|
| 1. ENV Introspection | Pass / Partial / Fail | [brief note] |
| 2. Provider Status | ... | ... |
...

## Critical Issues
[Numbered list of things that broke or produced wrong output]

## Areas of Improvement
[Numbered list of skill content gaps, ambiguous instructions, or missing examples]

## Recommended Skill Updates
For each skill that needs updating:
- **Skill:** factory-xxx
- **Gap:** [What was missing or unclear]
- **Suggestion:** [Specific wording or example to add]

## Recommended Prompt Updates
[Specific rewordings for exercises that produced poor first-attempt results]
\`\`\`

---

## Delegation Mode (Optional)

If you want to offload the execution to a subagent and only handle the analysis yourself:

1. Spawn a subagent with role "Factory Capabilities Evaluator".
2. Give it this exact task: "Execute all 10 exercises in the factory-self-improvement skill. For each exercise, record: what you did, whether it succeeded, and any issues encountered. Return a structured log with one entry per exercise."
3. Wait for the subagent to return its result envelope.
4. Use the subagent's log as input to Phase 2 (Analysis) and Phase 3 (Report).
`
  }
};
