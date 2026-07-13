# CrewFactory

**The Multi-Agent Development Platform — Powered by Qwen Cloud**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Qwen Cloud Hackathon](https://img.shields.io/badge/Qwen%20Cloud-Hackathon%202026-4ade80)](https://qwencloud-hackathon.devpost.com)
**Track 3 — Agent Society**

---

CrewFactory is a self-hosted platform for building, orchestrating, and benchmarking multi-agent systems — entirely from your browser. Create agents with roles and system prompts, connect them into group channels with configurable routing and negotiation protocols, and measure their collaboration efficiency against single-agent baselines. All with live streaming, real-time UI, and zero framework editing.

> A consulting firm where agents negotiate project scope. A code review team that catches bugs before merge. A financial modeling crew that debates risk. Define it once via API, reuse forever. One platform, infinite use cases.

---

## Features

### Multi-Agent Group Channels
- Create channels with multiple agents, each assigned a **hierarchical role** (lead, senior, member, observer)
- **@Mention routing** — agents tag peers to delegate tasks; the orchestrator dispatches to the right recipient
- **Reply modes**: user-only, broadcast, targeted, mention-only — full control over who hears what
- **Interactive Org Chart** powered by @xyflow/react — see your agent hierarchy in real time

### Algorithmic Negotiation Engine
- **Deterministic state machine** — regex-driven agreement/counter/rejection detection, not LLM guesswork
- **Configurable protocol** per channel: `agreementPattern`, `counterPattern`, `maxRounds`, `arbiterAgentId`
- **Auto-escalation** — when agents fail to converge after N rounds, the lead agent is dispatched as binding arbiter
- **Real-time badges** — "Ronda 1/3", "ACUERDO ALCANZADO", "ARBITRAJE CEO" rendered live in chat
- **Persisted state** — negotiation rounds survive server restarts via `negotiation-state.json`

### Efficiency Benchmarking Laboratory
- **A/B/C comparison**: single-agent baseline → multi-agent horizontal (no leader) → multi-agent hierarchical (with leader)
- **Compound scoring engine**: task quality (50%), efficiency (30%), negotiation effectiveness (20%)
- **LLM-Judge evaluation** with per-criteria scoring and reasoning
- **Historical runs** — compare performance across multiple executions
- **Export to workspace** — turn winning lab variants into permanent agents and channels

### MCP Integration
- **10 catalog servers**: GitHub, SQLite, Brave Search, Tavily, Fetch, Linear, Jira, Slack, Google Drive, Gmail
- **Dual transport**: stdio (local subprocess) and HTTP (SSE streaming)
- **Dynamic tool loading** — MCP tools injected as native agent tools at session creation
- **Fully configurable UI** — toggle servers on/off from the MCP settings tab

### Qwen Cloud Native
- **8 Qwen 3.x models** via DashScope API: Qwen 3.7 Max/Plus, Qwen 3.6 Max/Plus/Flash, Qwen 3.5 Plus/Flash
- **QWEN thinking format** — native `enable_thinking` parameter for reasoning-capable models
- **Image generation** with Qwen Wan-Image Pro, Qwen-Image 2.0 Pro, Z-Image Turbo
- **Vision tool** — programmatic image analysis using Qwen vision models
- **Direct DashScope API** — no proxy, no third-party router between your agents and Qwen Cloud

### Real-Time Streaming & WebSocket
- Single shared WebSocket connection with exponential-backoff reconnection
- Cookie-based authentication (httpOnly, no JS-accessible tokens)
- Server-initiated ping-pong keepalive with dead socket pruning
- Offline message queue (bounded, drops oldest with warning)

### Enterprise-Grade Platform
- **Better Auth integration** — SQLite-backed sessions with first-run onboarding
- **35+ providers** — OpenAI, Anthropic, Google, DeepSeek, Groq, Mistral, OpenCode Go, and more
- **Permission engine** — deny-first, then-ask, then-allow rule evaluation; fork-bomb and destructive pattern blocking
- **Config backup/restore** — export/import with merge or overwrite modes
- **Environment variable encryption** — AES-256-GCM at rest, masked UI, audit-logged reveal
- **PWA** — installable on mobile with offline-capable assets and auto-update on deploy
- **Spanish & English** — full i18n with per-component literal files

---

## Architecture

```
Qwen Cloud (DashScope API)
        │
        ▼
CrewFactory Backend (Bun + Hono)
    ├── qwen-provider.ts ──► ModelRegistry ──► AgentSession
    ├── ChannelOrchestrator
    │   ├── NegotiationStateMachine  (round counter, pattern matching)
    │   ├── ArbitrationProtocol     (leader escalation)
    │   └── AgentPromptRunner       (streaming LLM dispatch)
    ├── Laboratory
    │   ├── experiment-runner.ts    (A/B/C variant execution)
    │   ├── scoring.ts             (compound scoring engine)
    │   └── judge.ts               (LLM-Judge evaluation)
    ├── MCP Client/Registry        (10 servers, stdio + HTTP)
    ├── WebSocket (factory/registry pattern)
    └── File System (/tmp/crewfactory/{user}/)
         ├── channels/{id}/negotiation-state.json
         ├── agents/{id}/definition.json
         └── experiments/{id}/
        │
        ▼
CrewFactory Frontend (React 19 + Tailwind CSS v4 + Vite)
    ├── ChannelChatArea            (live multi-agent chat)
    ├── OrgFlowCanvas              (@xyflow/react hierarchy)
    ├── LaboratoryPage             (variant comparison + judge reports)
    ├── MCP Settings Tab           (server management)
    └── Provider Management        (35+ providers, API key management)
```

See [docs/architecture.md](docs/architecture.md) for the full detailed diagram.

---

## Quick Start

```bash
cp .env.example .env
# Edit .env with your credentials:
#   DASHSCOPE_API_KEY=sk-...         (Qwen Cloud)
#   OPENAI_API_KEY=sk-...            (OpenAI)
#   JWT_SECRET=your-secret           (auth signing key)

docker compose up -d
# CrewFactory running on http://localhost:3000
```

First launch triggers the onboarding wizard — create your admin account and you're in.

---

## Hackathon Submission

**Event:** Qwen Cloud Hackathon 2026
**Track:** Track 3 — Agent Society
**Submission URL:** [qwencloud-hackathon.devpost.com](https://qwencloud-hackathon.devpost.com)

### What We Built
A platform where multiple AI agents with distinct roles collaborate through structured negotiation, task delegation via @mentions, and algorithmic conflict resolution — with measurable efficiency gains over single-agent baselines, all powered by Qwen Cloud.

### Demo Video
[YouTube link — to be added]

### Key Differentiators
| Dimension | CrewAI | LangGraph | MetaGPT | **CrewFactory** |
|---|---|---|---|---|
| Live multi-agent UI | No | No | No | **Yes (Slack-like chat)** |
| Algorithmic negotiation | No | No | No | **Yes (state machine)** |
| A/B/C efficiency benchmark | No | Varies | No | **Yes (built-in lab)** |
| MCP integration | Via tools | Via tools | No | **Yes (10 servers)** |
| Qwen Cloud native | Varies | Varies | Varies | **Yes (DashScope API)** |
| Configure via API/UI | Code | Code | YAML | **Yes (POST + UI)** |

---

## License

MIT — see [LICENSE](LICENSE)
