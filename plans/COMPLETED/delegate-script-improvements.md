COMPLETED 
# Delegate Script Improvements - Implementation Plan

**Status:** Pending Implementation  
**Estimated effort:** 2-3 hours

---

## Goal

Enhance the existing `scripts/delegate.ts` script with missing features and improved UX based on agent feedback.

---

## Current State

The script already supports:
- ✅ `--agent <id>` - Delegate to programmatic agent
- ✅ `--channel <id>` - Delegate to multi-agent channel
- ✅ `--project <name>` - Delegate to project session
- ✅ SSE streaming with thinking/tool output
- ✅ JWT authentication via environment variables

---

## Missing Features

### 1. Session Delegation (`--session <id>`)

**Problem:** Cannot delegate to an existing session by ID.

**Solution:** Add `--session` flag that posts directly to `/api/sessions/:id/prompt/stream`.

```bash
bun run scripts/delegate.ts --session abc123 --message "Continue the analysis"
```

**Implementation:**
```typescript
async function delegateToSession(id: string, msg: string) {
  console.log(`\n>>> Delegating task to session: "${id}"`);
  
  const response = await fetch(`${baseUrl}/api/sessions/${id}/prompt/stream`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: msg }),
  });

  if (!response.ok) {
    console.error(`Failed to prompt session: ${response.status} - ${await response.text()}`);
    process.exit(1);
  }

  await streamResponse(response);
}
```

---

### 2. List Resources (`--list`)

**Problem:** No way to discover available agents, channels, projects, or sessions.

**Solution:** Add `--list` flag with optional resource type.

```bash
bun run scripts/delegate.ts --list agents      # List all agents
bun run scripts/delegate.ts --list channels    # List all channels
bun run scripts/delegate.ts --list projects    # List all projects
bun run scripts/delegate.ts --list sessions    # List all sessions
bun run scripts/delegate.ts --list             # List all resources
```

**Implementation:**
```typescript
async function listResources(type?: string) {
  const headers = { "Authorization": `Bearer ${token}` };
  
  if (!type || type === "agents") {
    const res = await fetch(`${baseUrl}/api/agents`, { headers });
    const { agents } = await res.json();
    console.log("\n=== Agents ===");
    for (const a of agents) {
      console.log(`  ${a.id} - ${a.name} (${a.status})`);
    }
  }
  
  if (!type || type === "channels") {
    const res = await fetch(`${baseUrl}/api/channels`, { headers });
    const { channels } = await res.json();
    console.log("\n=== Channels ===");
    for (const c of channels) {
      console.log(`  ${c.id} - ${c.name} (${c.members.length} members)`);
    }
  }
  
  if (!type || type === "projects") {
    const res = await fetch(`${baseUrl}/api/workspace-projects`, { headers });
    const { repos } = await res.json();
    console.log("\n=== Projects ===");
    for (const p of repos) {
      console.log(`  ${p.name} (last modified: ${p.lastModified})`);
    }
  }
  
  if (!type || type === "sessions") {
    const res = await fetch(`${baseUrl}/api/sessions`, { headers });
    const { sessions } = await res.json();
    console.log("\n=== Sessions ===");
    for (const s of sessions.slice(0, 20)) {
      const context = s.projectName || s.agentId || s.channelId || "global";
      console.log(`  ${s.id} - ${s.name} [${context}] (${s.messageCount} msgs)`);
    }
  }
}
```

---

### 3. Improved Error Messages

**Problem:** Error messages are generic and don't guide the user.

**Solution:** Add contextual error messages with suggestions.

```typescript
function handleError(status: number, endpoint: string, body: string) {
  console.error(`\n❌ Request failed: ${endpoint}`);
  console.error(`   Status: ${status}`);
  
  if (status === 401) {
    console.error(`   💡 Check your TOKEN or JWT_TOKEN environment variable`);
  } else if (status === 404) {
    console.error(`   💡 Resource not found. Use --list to see available resources`);
  } else if (status === 403) {
    console.error(`   💡 Access denied. Check your permissions`);
  } else if (status >= 500) {
    console.error(`   💡 Server error. Check server logs`);
  }
  
  if (body) {
    try {
      const json = JSON.parse(body);
      if (json.error) {
        console.error(`   Details: ${json.error}`);
      }
    } catch {}
  }
  
  process.exit(1);
}
```

---

### 4. Verbose Mode (`--verbose`)

**Problem:** No way to see full request/response details for debugging.

**Solution:** Add `--verbose` flag that prints HTTP details.

```bash
bun run scripts/delegate.ts --agent my-agent --message "Test" --verbose
```

**Output:**
```
>>> Request: POST http://localhost:3000/api/agents/my-agent/prompt
>>> Headers: { Authorization: 'Bearer eyJ...', Content-Type: 'application/json' }
>>> Body: { message: 'Test', stream: true }
>>> Response: 200 OK
>>> Streaming response...
```

---

### 5. Timeout Handling

**Problem:** No timeout for long-running operations.

**Solution:** Add `--timeout <seconds>` flag (default: 300s).

```bash
bun run scripts/delegate.ts --agent my-agent --message "Long task" --timeout 600
```

**Implementation:**
```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), timeoutMs);

try {
  const response = await fetch(url, {
    ...options,
    signal: controller.signal,
  });
  clearTimeout(timeout);
  // ...
} catch (err) {
  if (err.name === 'AbortError') {
    console.error(`\n❌ Request timed out after ${timeoutMs/1000}s`);
    process.exit(1);
  }
  throw err;
}
```

---

## Implementation Phases

### Phase 1: Session Delegation
- Add `--session` flag parsing
- Implement `delegateToSession()` function
- Update help text

### Phase 2: List Resources
- Add `--list` flag parsing
- Implement `listResources()` function
- Format output with colors and alignment

### Phase 3: Error Handling
- Create `handleError()` helper
- Replace all `console.error` calls with contextual errors
- Add suggestions for common issues

### Phase 4: Verbose Mode
- Add `--verbose` flag
- Log request details before each fetch
- Log response status and headers

### Phase 5: Timeout Handling
- Add `--timeout` flag (default 300s)
- Implement AbortController logic
- Update all fetch calls

---

## Testing

**Test cases:**
1. Delegate to existing session: `--session abc123 --message "Test"`
2. List all resources: `--list`
3. List specific resource: `--list agents`
4. Invalid token: verify error message suggests checking env var
5. Non-existent resource: verify 404 error suggests using `--list`
6. Verbose mode: verify request details are printed
7. Timeout: verify abort after specified time

---

## Files to Modify

- `scripts/delegate.ts` - All changes in this single file

---

## Usage Examples (After Implementation)

```bash
# Delegate to session
bun run scripts/delegate.ts --session abc123 --message "Continue analysis"

# List available resources
bun run scripts/delegate.ts --list agents
bun run scripts/delegate.ts --list channels
bun run scripts/delegate.ts --list projects
bun run scripts/delegate.ts --list sessions

# Verbose debugging
bun run scripts/delegate.ts --agent my-agent --message "Test" --verbose

# Custom timeout
bun run scripts/delegate.ts --project my-app --message "Build" --timeout 600
```
