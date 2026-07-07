COMPLETED
# Plan: Runtime Environment Check & Context Injection

## Problem
The agent doesn't know what OS, shell, or tools are available at runtime. It wastes hundreds of tokens trying Linux commands on Windows (or vice versa). The bash tool silently switches shells (`bash-tool.ts:51-53`) but the agent has no way to know this happened.

**Example**: Agent tries `curl`, `heredocs`, `cat > file << EOF` on Windows PowerShell — 10 failed tool calls, ~10,000 wasted tokens.

## Root Cause
Two injection points (`session-manager.ts:323` for global/repo sessions, `create-agent-server.ts:60` for programmatic agents) build `appendPrompts` but never include runtime environment information.

## Solution
Create a `env-check.ts` module that detects the runtime environment at session creation time and injects a structured context block into the agent's system prompt. This is dynamic — it reads the actual server environment, not hardcoded values.

## What Gets Detected

| Category | Details |
|---|---|
| **OS** | `process.platform` → human-readable (Windows, Linux, macOS) |
| **Shell** | Which shell the bash tool actually uses (`bash` vs `powershell.exe`) |
| **Architecture** | `process.arch` (x64, arm64) |
| **Runtime versions** | Bun, Node (if available) |
| **Available tools** | git, docker, python/python3, curl, jq, ffmpeg — detected via `which`/`where` |
| **Workspace paths** | CWD, home dir, temp dir |
| **Encoding** | Default system encoding hint (UTF-8 on Linux/macOS, may vary on Windows) |

## Plan Steps

### Phase 65: Runtime Environment Check

- [ ] 65.1 Create `apps/server/src/core/env-check.ts` module:
  - `detectEnvironment()` async function returning `RuntimeEnvironment` interface
  - `formatEnvironmentContext(env: RuntimeEnvironment): string` returning a structured prompt block
  - Tool detection via `spawnSync("which"/"where", [tool])` with timeout (non-blocking, 2s per tool)
  - Cache result per process (environment doesn't change during server lifetime)
  - Export `getEnvironmentContext(): string` as the main API (detect once, cache, return formatted string)

- [ ] 65.2 Inject environment context in `session-manager.ts` `getOrCreateSession`:
  - Import `getEnvironmentContext` from `env-check.ts`
  - Append to `appendPrompts` array (before the HTML preview instructions)
  - Format: `\n\nRuntime Environment:\n${getEnvironmentContext()}`

- [ ] 65.3 Inject environment context in `create-agent-server.ts`:
  - Same import, append to `appendSystemPrompt` array in `DefaultResourceLoader` constructor
  - Ensures programmatic agents also know their runtime environment

- [ ] 65.4 Add environment-aware command hints to the context:
  - On Windows: suggest `python -c` with `sys.stdout.reconfigure(encoding='utf-8')` for Unicode, `Invoke-RestMethod` or `python urllib` for HTTP, no heredocs
  - On Linux/macOS: standard bash commands work, `curl`, heredocs, etc.
  - On any OS: list which tools from the detected set are available
  - Keep it as **hints**, not restrictions — the agent can still try other approaches if needed

- [ ] 65.5 Verify TypeScript compilation (`bun run build` in server)

- [ ] 65.6 Update `about.md` and `steps.md`

## Design Decisions

### Why NOT a tool (`env_check`)?
A tool would cost a tool call (~500 tokens) every time the agent needs to know its environment. Injecting into the system prompt is zero-cost at runtime and always available. The environment is a **fact about the server**, not something the agent needs to "discover".

### Why detect once and cache?
`process.platform` and available tools don't change during the server's lifetime. Detecting once at first session creation and caching avoids redundant `spawnSync` calls.

### Why not hardcode OS in the prompt?
The same codebase runs on Linux (Docker/Coolify), macOS (dev), and Windows (dev). Hardcoding breaks portability. Dynamic detection works everywhere.

### Context format example
```
Runtime Environment:
- OS: Windows 10 (win32 x64)
- Shell: PowerShell (powershell.exe -NoProfile -NonInteractive -Command)
- Runtime: Bun 1.2.3
- Available tools: git, python3, docker, curl
- Workspace: C:\Users\themi\AgentWorkspace\crewfactory
- Temp: C:\Users\themi\AppData\Local\Temp

Command hints for this environment:
- Use `python -c "..."` for inline scripts. Always add `sys.stdout.reconfigure(encoding='utf-8')` before printing Unicode.
- For HTTP requests, use `python` with `urllib.request` or `Invoke-RestMethod`. Avoid `curl` (aliased to Invoke-WebRequest with incompatible syntax).
- Heredocs (`<< EOF`) are NOT supported. Use multi-line strings or file writes instead.
```

## Files Affected
| File | Change |
|---|---|
| `apps/server/src/core/env-check.ts` | **NEW** — environment detection module |
| `apps/server/src/core/session-manager.ts` | Import + inject `getEnvironmentContext()` into `appendPrompts` |
| `apps/server/src/agents/create-agent-server.ts` | Import + inject into `appendSystemPrompt` |

## Risk Assessment
- **Low risk**: Purely additive. No existing behavior changes.
- **Performance**: `spawnSync` for tool detection runs once per server start, cached after. ~50ms one-time cost.
- **Token cost**: ~150 tokens added to system prompt. Saves thousands of tokens wasted on failed commands.
