# CrewFactory Architecture

## System Overview

CrewFactory is a self-hosted multi-agent platform powered by Qwen Cloud. Agents run in isolated workspaces, communicate through configurable group channels with algorithmic negotiation, and are benchmarked in a built-in laboratory.

```mermaid
graph TB
    subgraph "Qwen Cloud"
        DS[DashScope API<br/>dashscope-intl.aliyuncs.com]
    end

    subgraph "Backend (Bun + Hono)"
        direction TB

        subgraph "AI Layer"
            QP[qwen-provider.ts<br/>8 Qwen 3.x models]
            MR[ModelRegistry<br/>35+ providers]
            AS[AgentSession<br/>ReAct loop + streaming]
            QP --> MR --> AS
            DS --> QP
        end

        subgraph "Channel Orchestration"
            CO[ChannelOrchestrator]
            NSM[NegotiationStateMachine<br/>round counter + pattern matching]
            AP[ArbitrationProtocol<br/>leader escalation]
            APR[AgentPromptRunner<br/>streaming dispatch]
            CO --> NSM
            CO --> AP
            CO --> APR
        end

        subgraph "Laboratory"
            ER[Experiment Runner<br/>A/B/C variants]
            SC[Scoring Engine<br/>compound scores]
            LJ[LLM-Judge<br/>criteria evaluation]
            ER --> SC
            ER --> LJ
            ER --> CO
        end

        subgraph "MCP"
            MCPC[MCP Client<br/>stdio + HTTP]
            MCPR[MCP Registry<br/>10 catalog servers]
            MCPC --> MCPR
        end

        subgraph "Infrastructure"
            WS[WebSocket<br/>factory + registry pattern]
            AUTH[Better Auth<br/>SQLite sessions]
            FS[File System<br/>workspaces + state]
        end
    end

    subgraph "Frontend (React 19 + Tailwind v4)"
        CC[ChannelChatArea<br/>live multi-agent chat]
        OC[OrgFlowCanvas<br/>@xyflow/react hierarchy]
        LP[LaboratoryPage<br/>variant comparison]
        MCPS[McpTab<br/>server management]
        PVD[Provider Management<br/>API keys + models]
    end

    AS --> CO
    AS --> MCPC
    AS --> WS
    CO --> WS
    ER --> WS

    WS --> CC
    WS --> OC
    WS --> LP
    WS --> MCPS

    AUTH --> WS
    FS --> AS
    FS --> CO
    FS --> ER
```

## Key Components

### 1. Qwen Cloud Integration (`core/providers/qwen-provider.ts`)
- Direct DashScope API calls via `dashscope-intl.aliyuncs.com/compatible-mode/v1`
- 8 Qwen 3.x models with native thinking format support
- Image generation via Qwen Wan-Image 2.0 and Z-Image Turbo

### 2. Negotiation Engine (`channels/negotiation-state.ts`)
- Deterministic state machine tracking per-pair negotiation state
- Regex-driven agreement/counter/rejection detection
- Automatic escalation to arbiter after `maxRounds`
- Persistent state via `negotiation-state.json` per channel

### 3. Channel Orchestrator (`channels/channel-orchestrator.ts`)
- Actor-model dispatch: parallel between agents, FIFO within
- @mention parsing with autocomplete for task delegation
- Configurable `maxChainDepth` (1-50)
- Equilibrium detection — stops chain when agents go silent for 2+ rounds
- Abort dispatch with cascading agent cleanup

### 4. Laboratory (`laboratory/`)
- **experiment-runner.ts**: Runs 3 variants sequentially — single-agent baseline (A), multi-agent horizontal (B), multi-agent hierarchical with leader (C)
- **scoring.ts**: Compound scoring — task quality (50%), efficiency (30% with time/token penalty), negotiation (20% with agreement rounds and escalation penalty)
- **judge.ts**: LLM-Judge with per-criteria scores and structured reasoning
- **experiment-store.ts**: CRUD with blueprint loading, historical runs, variant export to workspace

### 5. MCP Integration (`core/mcp-client.ts`, `core/mcp-registry.ts`)
- Dual transport: stdio (subprocess) and HTTP (SSE streaming)
- 10 catalog servers: GitHub, SQLite, Brave Search, Tavily, Fetch, Linear, Jira, Slack, GDrive, Gmail
- Dynamic tool loading — MCP tools become native agent tools at session creation
- Configurable per session via Settings UI

### 6. WebSocket Layer (`ws/`)
- **factory.ts**: Cookie-based auth via `auth.api.getSession`, closure-captured `wsId`, transactional auto-subscribe on prompt
- **registry.ts**: Explicit cleanup, no global counter, no socket mutation
- **logger.ts**: Structured logging
- Server-initiated 30s ping-pong with dead socket pruning

### 7. Agent Session (`ai/agent-session.ts`)
- Vendored agent runtime with ReAct loop
- Tool execution: bash, read, write, edit, grep, find, ls, vision, generate_image, spawn_subagent, delegate_task, manage_factory, web_fetch
- Permission engine: deny-first, then-ask, then-allow
- Streaming responses with progressive tool output logs
- Context compaction with branch summarization

### 8. Frontend (`apps/client/`)
- React 19 with TypeScript strict mode
- Tailwind CSS v4 with design tokens (no raw hex values)
- Mobile-first responsive: 375px, 768px, 1280px breakpoints
- Framer Motion for hardware-accelerated transitions
- Full i18n (English/Spanish) via per-component `.literals.ts` files

## Data Flow

```
User types "@TechLead scope proposal for ecommerce"
    │
    ▼
Orchestrator parses @mention → resolves recipient
    │
    ▼
AgentPromptRunner sends prompt to TechLead agent
    │
    ▼
AgentSession runs ReAct loop (thinking → tool calls → response)
    │
    ▼
Response broadcast via WebSocket to all channel subscribers
    │
    ▼
NegotiationStateMachine.ingest() checks for agreement/counter/reject patterns
    │
    ├── matched "agreed" → emit channel_negotiation_agreement, stop chain
    ├── matched "counter" → increment rounds, continue chain
    ├── rounds >= maxRounds → escalate to arbiter agent
    └── none matched → continue to next agent in round
```

## File System Layout

```
/tmp/crewfactory/{username}/
├── workspace/                    # Global user workspace
│   ├── .agents/skills/           # Factory skills
│   ├── assets/
│   │   ├── uploads/              # User-uploaded files
│   │   └── generated/            # Agent-generated outputs
│   └── memories/                 # Agent notes and context
├── projects/{id}/
│   ├── project.json              # Metadata (name, clone URL)
│   └── workspace/                # Isolated project workspace
├── agents/{id}/
│   ├── definition.json           # Agent config + system prompt
│   ├── avatar.*                  # Agent profile photo
│   └── sessions/                 # Agent chat history
├── channels/{id}/
│   ├── channel.json              # Members, roles, protocol config
│   ├── messages.jsonl            # Append-only message log
│   └── negotiation-state.json    # Per-pair negotiation state
├── experiments/{id}/
│   ├── experiment.json           # Blueprint + variant config
│   └── runs/{runId}.json         # Per-run results + scores
└── sessions/                     # User chat sessions
```

## Security

- **Encryption at rest**: AES-256-GCM for `env.json` and `auth.json`, key derived from `JWT_SECRET`
- **Cookie-based auth**: httpOnly cookies, no JS-accessible tokens, automatic CSRF protection
- **Bash output filter**: Masks user secrets from stdout/stderr with `***hidden***`
- **Permission engine**: Blocks destructive commands (fork bombs, recursive deletion, pipe-to-bash)
- **Process protection**: Prevents killing critical server processes (ports 3000, 3001, 4104, 5173)
- **Audit logging**: Tracks environment variable access at `/tmp/crewfactory/_audit/`
