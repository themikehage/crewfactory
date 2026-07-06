# Plan: Exa Search Integration as Official Tool

Integrate [Exa](https://exa.ai) as a first-class, officially-registered agent tool (`exa_search`) that enables CrewFactory agents to perform grounded web search with neural embeddings, content extraction, and structured synthesis.

---

## 1. Overview

### What
Add `exa_search` as a named entry in `AVAILABLE_TOOLS` and implement a dedicated server-side tool that wraps Exa's REST `/search` API. No external npm dependency is needed — Bun's native `fetch()` calls the Exa REST API directly.

### Why
Agents currently have no web search capability. Exa provides neural search with high-quality excerpts (highlights), domain filtering, freshness control, and structured output — ideal for coding agents that need documentation lookup, API reference retrieval, debugging research, and current-awareness queries.

### Key Constraints
- **Zero npm deps** — called via native `fetch()`
- **API key management** via existing Settings > Env Vars (`EXA_API_KEY`)
- **Tool gated by permissions** — same toggle mechanism as all other tools
- **Streaming-unfriendly** — Exa search is a single REST call, not a stream; tool result is delivered atomically
- **`highlights: true` by default** — most token-efficient mode for agent contexts

---

## 2. Files to Create

### 2.1 `apps/server/src/core/exa-search-tool.ts` — Tool Definition

Factory function `createExaSearchTool()` returning a tool object following the `UiToolDefinition` shape:

```typescript
export interface ExaSearchOptions {
  username: string;
}

export function createExaSearchTool(opts: ExaSearchOptions) {
  return {
    name: "exa_search",
    description: `Search the web using Exa AI (semantic search engine). Returns query-relevant excerpts (highlights) with source URLs. Use this for documentation lookup, API references, debugging research, and current-awareness queries. Requires EXA_API_KEY to be configured in Settings > Env Vars.`,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Natural language search query. Supports long, semantically rich descriptions."
        },
        type: {
          type: "string",
          enum: ["auto", "fast", "instant", "deep-lite", "deep", "deep-reasoning"],
          description: "Search method. auto=balanced, fast/instant=low-latency, deep-lite/deep/deep-reasoning=synthesized multi-step.",
          default: "auto"
        },
        numResults: {
          type: "integer",
          description: "Number of results (1-25).",
          default: 10,
          minimum: 1,
          maximum: 25
        },
        includeDomains: {
          type: "array",
          items: { type: "string" },
          description: "Only return results from these domains (e.g. [\"arxiv.org\", \"github.com\"])."
        },
        excludeDomains: {
          type: "array",
          items: { type: "string" },
          description: "Exclude results from these domains (e.g. [\"pinterest.com\"])."
        },
        category: {
          type: "string",
          enum: ["company", "people", "research paper", "news", "personal site", "financial report"],
          description: "Focus on specific content type."
        },
        startPublishedDate: {
          type: "string",
          description: "ISO 8601 date. Only return results published after this date (e.g. \"2025-01-01\")."
        },
        endPublishedDate: {
          type: "string",
          description: "ISO 8601 date. Only return results published before this date."
        },
        maxAgeHours: {
          type: "integer",
          description: "Max age of cached content in hours. 0=always livecrawl, -1=never livecrawl. Omit for balanced default.",
          minimum: -1
        },
        contentMode: {
          type: "string",
          enum: ["highlights", "text", "summary"],
          description: "Content extraction mode. highlights=token-efficient excerpts, text=full page text, summary=LLM summary.",
          default: "highlights"
        },
        textMaxCharacters: {
          type: "integer",
          description: "Max characters for text content mode. Only used when contentMode is 'text'.",
          default: 10000
        }
      },
      required: ["query"]
    },
    execute: async (toolCallId: string, args: any, parentSignal?: AbortSignal) => {
      // 1. Read EXA_API_KEY from user env.json or process.env
      // 2. Build request body from args
      // 3. POST to https://api.exa.ai/search with x-api-key header
      // 4. Parse response
      // 5. Format results for agent consumption
      // 6. Return { content, details }
    }
  };
}
```

### 2.2 `packages/shared/src/types.ts` (or schemas.ts) — Optional Types

If needed, export the parameter types for reuse:

```typescript
export const EXA_SEARCH_TYPES = ["auto", "fast", "instant", "deep-lite", "deep", "deep-reasoning"] as const;
export const EXA_CONTENT_MODES = ["highlights", "text", "summary"] as const;
export const EXA_CATEGORIES = ["company", "people", "research paper", "news", "personal site", "financial report"] as const;
```

---

## 3. Files to Modify

### 3.1 `packages/shared/src/schemas.ts` — Register Tool Name

Add `"exa_search"` to `AVAILABLE_TOOLS`:

```typescript
export const AVAILABLE_TOOLS = [
  "read", "write", "edit", "bash", "grep", "find", "ls",
  "request_approval", "ask_question", "render_images", "render_chart", "share_file", "refresh_ui",
  "exa_search",  // <-- ADD
] as const;
```

This enables:
- Toggle via `ToolsSelector` in the UI
- Persistence in session `metadata.json`
- Permission control (Read-Only preset excludes it, Full Access includes it)

### 3.2 `apps/server/src/core/session-manager.ts` — Inject Tool

```typescript
import { createExaSearchTool } from "./exa-search-tool";

// In getOrCreateSession(), alongside createUiTools:
const exaSearchTool = createExaSearchTool({ username });

// Add to customTools array:
customTools: [customBashTool as any, ...uiTools as any, exaSearchTool as any],
```

`exa_search` should be gated behind tool permissions (NOT always-on), so it's excluded from `alwaysOnTools`.

### 3.3 `apps/server/src/ws/handler.ts` — Preserve on Prompt Override

Add `"exa_search"` to the preserved tool set in the WebSocket prompt handler, alongside `mcp_` prefixed tools:

```typescript
const currentActive = session.getActiveToolNames();
const exaActive = currentActive.filter((tName) => tName === "exa_search");
const mcpActive = currentActive.filter((tName) => tName.startsWith("mcp_"));
session.setActiveToolsByName(
  Array.from(new Set([
    ...tools,
    ...mcpActive,
    ...exaActive,    // <-- preserve exa_search if user had it enabled
    "request_approval",
    // ... always-on tools
  ]))
);
```

### 3.4 `apps/server/src/core/default-factory-skills.ts` — Factory Skill

Optionally add a brief usage hint in the factory skill prompts so agents know `exa_search` exists and when to use it. This is a documentation amendment to existing factory skill prompts.

---

## 4. API Key Resolution Strategy

The tool reads `EXA_API_KEY` from two sources in priority order:

1. **User env.json** (`/tmp/crewfactory/{username}/env.json`) — set via Settings > Env Vars UI
2. **Process environment** (fallback) — injected via Coolify env vars

Implementation in the tool's `execute`:

```typescript
// Inside exa-search-tool.ts
function getExaApiKey(username: string): string | null {
  const envPath = `/tmp/crewfactory/${username}/env.json`;
  try {
    const env = JSON.parse(fs.readFileSync(envPath, "utf-8"));
    if (env.EXA_API_KEY) return env.EXA_API_KEY;
  } catch {}
  return process.env.EXA_API_KEY || null;
}
```

If no key is found, the tool returns a clear error message telling the user to configure it in Settings.

---

## 5. Execute Implementation Details

```typescript
execute: async (toolCallId: string, args: any, parentSignal?: AbortSignal) => {
  const apiKey = getExaApiKey(username);
  if (!apiKey) {
    return {
      content: [{ type: "text", text: "EXA_API_KEY not configured. Go to Settings > Env Vars to add it." }],
      isError: true,
    };
  }

  // Build the request body
  const body: Record<string, any> = {
    query: args.query,
    type: args.type || "auto",
    numResults: Math.min(args.numResults || 10, 25),
  };

  // Content configuration
  const contentMode = args.contentMode || "highlights";
  body.contents = {};
  if (contentMode === "highlights") body.contents.highlights = true;
  else if (contentMode === "text") body.contents.text = { maxCharacters: args.textMaxCharacters || 10000 };
  else if (contentMode === "summary") body.contents.summary = true;

  // Optional filters
  if (args.includeDomains?.length) body.includeDomains = args.includeDomains;
  if (args.excludeDomains?.length) body.excludeDomains = args.excludeDomains;
  if (args.category) body.category = args.category;
  if (args.startPublishedDate) body.startPublishedDate = args.startPublishedDate;
  if (args.endPublishedDate) body.endPublishedDate = args.endPublishedDate;
  if (args.maxAgeHours !== undefined) body.contents.maxAgeHours = args.maxAgeHours;

  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
    signal: parentSignal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      content: [{ type: "text", text: `Exa API error (${response.status}): ${errorText}` }],
      isError: true,
    };
  }

  const data = await response.json();

  // Format results for agent consumption
  const resultLines = data.results.map((r: any, i: number) => {
    const lines = [`${i + 1}. ${r.title || "Untitled"}`];
    lines.push(`   URL: ${r.url}`);
    if (r.publishedDate) lines.push(`   Published: ${r.publishedDate}`);
    if (r.author) lines.push(`   Author: ${r.author}`);
    if (r.highlights?.length) {
      r.highlights.forEach((h: string) => lines.push(`   > ${h}`));
    }
    if (r.text) lines.push(`   ${r.text.substring(0, 500)}...`);
    if (r.summary) lines.push(`   Summary: ${r.summary}`);
    return lines.join("\n");
  }).join("\n\n");

  const details: Record<string, any> = {
    totalResults: data.results.length,
    searchType: data.searchType || args.type || "auto",
    requestId: data.requestId,
    results: data.results.map((r: any) => ({
      title: r.title,
      url: r.url,
      publishedDate: r.publishedDate,
    })),
  };

  if (data.costDollars) {
    details.costDollars = data.costDollars;
  }

  if (data.output) {
    details.synthesizedOutput = data.output.content;
    details.grounding = data.output.grounding;
  }

  return {
    content: [{ type: "text", text: resultLines }],
    details,
  };
}
```

---

## 6. UI Considerations

### 6.1 Tool Removal from UI (No New Component)
`exa_search` is an **invisible tool** — it has no interactive card component. It is:
- Toggled via the existing `ToolsSelector` dropdown (appears as a checkbox "exa_search")
- Executed as a regular tool call row in `ToolCallRow` (plain `BashResult`-style output)
- No custom `ApprovalForm` or `ChartView` needed

### 6.2 Conditional Visibility by API Key Configuration

The tool must be visually disabled/hidden in the UI when `EXA_API_KEY` is not configured, and the agent must not be able to activate it. This requires coordinated changes on both server and client.

#### 6.2.1 Server: Extend `GET /api/sessions/:id/tools` Response

**File:** `apps/server/src/routes/sessions.ts`

Add a `toolStatus` field to the response indicating for each credential-gated tool whether its required env var is configured:

```typescript
// In routes/sessions.ts, GET "/:id/tools" handler

// Read user env.json to check which API keys are configured
function getToolStatus(username: string): Record<string, "available" | "missing_key"> {
  const status: Record<string, "available" | "missing_key"> = {};
  const envPath = `/tmp/crewfactory/${username}/env.json`;
  let env: Record<string, string> = {};
  try {
    env = JSON.parse(fs.readFileSync(envPath, "utf-8"));
  } catch {}
  // Gated tools registry
  status.exa_search = env.EXA_API_KEY ? "available" : "missing_key";
  // Future gated tools can be added here
  // status.some_other_tool = env.SOME_KEY ? "available" : "missing_key";
  return status;
}

// Add to the response:
const toolStatus = getToolStatus(username);
return c.json({ tools, serialTools, toolStatus });
```

This pattern is **extensible** — any future tool requiring an API key (e.g. a Brave Search tool, a Tavily tool, etc.) just adds a new entry to `getToolStatus()`.

#### 6.2.2 Client: Extend `ToolsSelector` Props

**File:** `apps/client/src/components/chat/ToolsSelector.tsx`

Add two new props: `toolStatus` and `onStatusHover`-equivalent:

```typescript
interface Props {
  activeTools: string[];
  onChange: (tools: string[]) => void;
  disabled?: boolean;
  toolStatus?: Record<string, "available" | "missing_key">;
}
```

Modify the `ALL_TOOLS` array to add a `gateKey` field for credential-gated tools:

```typescript
export const ALL_TOOLS = [
  // ... existing tools ...
  { id: "exa_search", name: "Exa Search", desc: "Search the web using Exa AI (semantic search)", gateKey: "EXA_API_KEY" },
];
```

Modify the tool checkbox rendering:

```typescript
{ALL_TOOLS.map((t) => {
  const isGated = t.gateKey && toolStatus?.[t.id] === "missing_key";
  const checked = activeTools.includes(t.id);
  const disabledTool = disabled || isGated;

  return (
    <label
      key={t.id}
      className={`flex items-start gap-2.5 p-1.5 rounded-md transition-colors ${
        disabledTool ? "opacity-40 cursor-not-allowed" : "hover:bg-card-hover/50 cursor-pointer"
      }`}
      title={isGated ? `Requires ${t.gateKey} in Settings > Env Vars` : undefined}
    >
      <input type="checkbox" checked={checked} disabled={disabledTool}
        onChange={() => !disabledTool && handleToggleTool(t.id)}
        className="mt-0.5 accent-accent" />
      <div>
        <div className="font-semibold text-foreground font-mono text-xs">{t.id}</div>
        <div className="text-muted-foreground text-xs leading-snug">
          {t.desc}
          {isGated && <span className="block text-warning text-2xs mt-0.5">Requires {t.gateKey}</span>}
        </div>
      </div>
    </label>
  );
})}
```

#### 6.2.3 Client: Pass `toolStatus` from `InputArea`

**File:** `apps/client/src/components/chat/InputArea.tsx`

Add `toolStatus` to the fetch and pass it to `ToolsSelector`:

```typescript
// In InputArea.tsx
const [toolStatus, setToolStatus] = useState<Record<string, "available" | "missing_key">>({});

// In fetchTools:
const data = await res.json();
setActiveTools(data.tools ?? DEFAULT_TOOLS);
setToolStatus(data.toolStatus ?? {});
```

```typescript
// In the ToolsSelector render:
<ToolsSelector
  activeTools={activeTools}
  onChange={setAndPersistTools}
  disabled={disabled}
  toolStatus={toolStatus}
/>
```

#### 6.2.4 Full Data Flow

```
User has no EXA_API_KEY configured:

1. Server returns  toolStatus: { exa_search: "missing_key" }
2. ToolsSelector renders exa_search checkbox as disabled + dimmed + warning tooltip
3. User cannot enable exa_search in the tools menu
4. If a persisted session had exa_search enabled (e.g. from a config import),
   the server-side session-manager.ts should auto-remove it from active tools
   when getOrCreateSession() runs and the key is missing.
```

This ensures exa_search is **invisible and unusable** until the user explicitly configures the API key via Settings > Env Vars — exactly the same UX pattern as provider authentication.

---

## 7. Implementation Steps

| # | Step | Files | Description |
|---|------|-------|-------------|
| 1 | Register tool name | `packages/shared/src/schemas.ts` | Add `"exa_search"` to `AVAILABLE_TOOLS` |
| 2 | Create tool module | `apps/server/src/core/exa-search-tool.ts` | Implement `createExaSearchTool()` factory with full Exa API integration |
| 3 | Wire into sessions | `apps/server/src/core/session-manager.ts` | Import and include `exaSearchTool` in `customTools` array |
| 4 | Auto-remove if missing key | `apps/server/src/core/session-manager.ts` | In `getOrCreateSession()`, filter `exa_search` from active tools if `EXA_API_KEY` is missing |
| 5 | Extend tools endpoint | `apps/server/src/routes/sessions.ts` | Add `toolStatus` field to `GET /:id/tools` response with key status per gated tool |
| 6 | Preserve on prompt | `apps/server/src/ws/handler.ts` | Preserve `exa_search` name during WebSocket tool override |
| 7 | Extend ToolsSelector | `apps/client/src/components/chat/ToolsSelector.tsx` | Add `gateKey` to `ALL_TOOLS`, accept `toolStatus` prop, disable/dim if key missing |
| 8 | Wire toolStatus in InputArea | `apps/client/src/components/chat/InputArea.tsx` | Fetch `toolStatus` from API, pass to `ToolsSelector` |
| 9 | Add to subagents | `apps/server/src/core/spawn-subagent-tool.ts` | Optionally include `exa_search` in subagent tool list |
| 10 | Document | `about.md` | Document the new tool, env var, and usage |
| 11 | Update plans | `plans/_index.md` | Link this plan file |

---

## 8. Future Considerations (Out of Scope)

- **`exa-js` SDK integration** — not needed; `fetch()` keeps the bundle zero-dep
- **`exa_search_stream`** — Exa supports `stream: true` with OpenAI-compatible SSE chunks; could be added later for real-time search-as-you-type
- **`/contents` endpoint** — a second tool `exa_get_contents` for extracting full text from known URLs
- **`/answer` endpoint** — a question-first grounded answer tool with auto-search
- **Caching layer** — deduplicate repeated queries within a session to save API costs
- **Usage dashboard** — track Exa API cost per session/user
