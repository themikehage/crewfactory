# Building a Multi-Agent Negotiation Platform on Qwen Cloud

*Published for the Qwen Cloud Hackathon 2026 — Track 3: Agent Society*

---

Most AI agent frameworks today are libraries: you write code, define a graph, and run it from a terminal. That's fine for engineers. But what if you want your agents to collaborate in a Slack-like channel, negotiate with deterministic rules, and benchmark their efficiency — all from a browser, without editing a single line of code?

That's what we built with **CrewFactory**: a self-hosted multi-agent platform where you create agents, connect them into group channels with configurable negotiation protocols, and measure their performance in a built-in laboratory. And the whole thing runs on Qwen Cloud.

---

## The Problem: Agents That Talk, Not Negotiate

Most multi-agent setups today work like this: you give each agent a system prompt, put them in a room, and hope they figure it out. If they agree, great. If they loop, you kill the process. If they disagree, there's no resolution — just noise.

The Track 3 challenge ("Agent Society") asks for three things:
1. **Task decomposition and role assignment** — agents should know who does what
2. **Disagreement resolution** — agents should resolve conflicts, not just talk past each other
3. **Measurable efficiency gains** — multi-agent should be provably better than single-agent

We built all three.

---

## The Solution: Deterministic Negotiation, Not LLM Guesswork

Instead of hoping the LLM learns to negotiate, we gave each channel a **Negotiation Protocol**:

```json
{
  "negotiationProtocol": {
    "agreementPattern": "ACUERDO ALCANZADO:",
    "counterPattern": "CONTRAPROPONE:",
    "rejectPattern": "RECHAZO",
    "maxRounds": 3,
    "arbiterAgentId": "ceo-agent-id"
  }
}
```

This is parsed by a **deterministic state machine** that:

- **Counts rounds**: Each agent pair tracks how many times they've gone back and forth
- **Detects patterns via regex**: Agreement, counter-proposal, rejection — all parsed from agent output
- **Escalates automatically**: If agents haven't converged after `maxRounds`, the arbiter (usually the lead agent) is dispatched with a binding verdict message
- **Persists state**: Negotiation state survives server restarts via `negotiation-state.json`

The LLM writes the content. The state machine enforces the rules. No more infinite loops.

---

## Proving It Works: A/B/C Benchmarking

"Multi-agent is better" is a claim. "Multi-agent outperforms single-agent by 12% on task quality while reaching consensus in 2.3 rounds" is data.

Our **Laboratory** runs three variants on the same task:

- **A (Single Agent Baseline)**: One agent handles the entire task alone
- **B (Multi-Agent Horizontal)**: Multiple agents broadcast to each other, no leader
- **C (Multi-Agent Hierarchical)**: Multiple agents with a lead who coordinates, delegates via @mentions, and arbitrates deadlocks

Each variant is scored on:
- **Task Quality (50%)**: How good is the final output? (LLM-Judge evaluated)
- **Efficiency (30%)**: How much time and tokens did it take? (Penalized vs baseline)
- **Negotiation (20%)**: Did agents reach agreement? How many rounds? Any escalations?

The result is a side-by-side comparison table with a crown on the winner. In our demo (a consulting firm negotiating project scope), the hierarchical variant consistently outperforms — because the lead agent prevents the horizontal group from talking in circles.

---

## Why Qwen Cloud?

We chose Qwen Cloud for three reasons:

1. **Native thinking support**: Qwen 3.x models have a dedicated `enable_thinking` parameter that we use for reasoning-heavy negotiation tasks. Other providers bolt thinking on as a separate parameter.

2. **Direct API, no proxy**: Our `qwen-provider.ts` hits `dashscope-intl.aliyuncs.com/compatible-mode/v1` directly. No OpenRouter, no third-party router. Lower latency, fewer failure points.

3. **Image generation**: Qwen's Wan-Image 2.0 and Z-Image Turbo are available through the same DashScope API key — our agents can generate graphics for the proposals they write.

The integration was straightforward: register a provider with the DashScope base URL and API key, and all 8 Qwen 3.x models become available in the model selector with their full capabilities (thinking, vision, context windows).

---

## MCP Integration: Agents That Act

Negotiation is great, but agents also need to *do* things. We integrated Model Context Protocol with 10 catalog servers:

- **GitHub**: Create issues, list PRs, read files
- **SQLite**: Query structured data
- **Brave Search / Tavily**: Web research during negotiation
- **Linear / Jira**: Project management integration
- **Slack**: Post updates to team channels
- **Google Drive / Gmail**: Document access and email

Each MCP server's tools are dynamically loaded as native agent tools. An agent negotiating a project scope can query GitHub for past similar projects, check Linear for team availability, and post the final proposal to Slack — all as tool calls within the negotiation flow.

---

## What We Learned

1. **LLMs are terrible at counting rounds.** If you leave negotiation to the prompt, agents will loop until context runs out. The state machine solves this deterministically.

2. **Hierarchy matters.** Horizontal teams (everyone broadcasts) produce more creative ideas but struggle to converge. Adding a lead agent with arbitration authority consistently improves both quality and efficiency.

3. **Qwen's thinking mode is a superpower.** When agents need to reason through a complex negotiation (budget breakdowns, scope tradeoffs), enabling thinking mode produces more structured, defensible proposals than standard generation. The extra latency is worth it for negotiation quality.

4. **Cookie-based WebSocket auth is harder than it looks.** Migrating from localStorage JWT to httpOnly cookies for WebSocket authentication required careful handling of the `Set-Cookie` header server-side and `credentials: "include"` client-side. The `__Secure-` prefix for cross-origin safety adds complexity. But it's the right call for production security.

5. **UI matters for adoption.** MetaGPT and ChatDev are powerful frameworks, but running them requires reading YAML and reading terminal output. A Slack-like multi-agent chat with org charts, negotiation badges, and side-by-side benchmark tables makes the system *feel* different — and that matters when judges have 15 minutes.

---

## What's Next

- **More channel blueprints**: Code review team, financial modeling crew, editorial pipeline
- **Meta-agent optimization**: Analyze tool-call patterns from past runs to auto-suggest efficiency improvements
- **Persistent agent memory**: Cross-session memory so agents learn from past negotiations

---

## Try It Yourself

CrewFactory is open source (MIT). It runs on any Linux server with Docker.

```bash
git clone https://github.com/themikehage/crewfactory
echo "DASHSCOPE_API_KEY=sk-your-key" > .env
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
docker compose up -d
```

Then open `http://localhost:3000`, create your admin account, and start building agent societies.

**GitHub:** [github.com/themikehage/crewfactory](https://github.com/themikehage/crewfactory)
**Demo Video:** [YouTube — to be added]
**Hackathon Track:** Track 3 — Agent Society

---

*Built with Qwen Cloud, Bun, Hono, React 19, TypeScript, and Tailwind CSS v4.*
