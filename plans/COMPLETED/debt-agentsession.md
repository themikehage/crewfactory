COMPLETED
# Technical Debt: AgentSession vs Agent Class

## Problem

`AgentSession` at `apps/server/src/ai/agent-session.ts` bypasses pi's `Agent`
class (575 lines at `vendor/agent/src/agent.ts`) and calls `runAgentLoop()`
directly with an inline event handler. This loses:

| Feature | Agent class | AgentSession |
|---------|-------------|--------------|
| `PendingMessageQueue` with `QueueMode` | Yes (all / one-at-a-time) | No (drains all at once) |
| Separate steer/followUp queues | Yes (2 queues) | No (1 queue, shared) |
| `waitForIdle()` lifecycle | Yes | No |
| `handleRunFailure()` structured errors | Yes | Generic catch block |
| `processEvents()` state reducer | Yes | No (inline if/else) |
| `continue()` with queue drain | Yes | Not implemented |
| `reset()` full state reset | Yes | No |
| `subscribe()` with abort signal | Yes | No signal in listener |
| Tool execution via state machine | Yes | Manual ad-hoc wrapper |

Additionally:
- `compact()` is a stub that does nothing (`agent-session.ts:372-375`)
- `navigateTree()` is a stub that just changes branch (`agent-session.ts:377-381`)
- No compaction (pi's `harness/compaction/` is 500+ lines)
- No `NodeExecutionEnv` (not even present in vendor)
- `tool_execution_update` events are dropped

## Scope of Work

### Phase 1: Adopt the Agent class

Refactor `AgentSession` to use `vendor/agent/src/agent.ts` internally:

```typescript
import { Agent } from "../../ai/vendor/agent/src/agent";

class AgentSession {
  private agent: Agent;

  constructor(options: CreateAgentSessionOptions) {
    // Build the AgentConfig from our options
    this.agent = new Agent({
      systemPrompt: "...",
      tools: this.activeTools,
      convertToLlm,
      model,
      getApiKey: ...,
      streamFn: streamSimple,
      // Agent class's prepareNextTurn, getSteeringMessages, etc.
    });
  }

  async prompt(messageText: string, opts?: any): Promise<any> {
    // Delegate to Agent.prompt()
    const result = await this.agent.prompt(messageText, { signal: this.abortController?.signal });
    // Sync our message list
    this.messages = this.agent.state.messages;
  }

  subscribe(listener): () => void {
    return this.agent.subscribe((event) => {
      // Map Agent events to our event format
      this.emit(this.mapEvent(event));
    });
  }

  steer(messageText: string): void {
    this.agent.steer(messageText);
  }

  followUp(messageText: string): void {
    this.agent.followUp(messageText);
  }

  abort(): Promise<void> {
    return this.agent.abort();
  }

  dispose(): void {
    this.agent.dispose();
  }
}
```

**Changes needed:**
1. `Agent` class expects `AgentConfig` — bridge our loopConfig
2. Wire `agent.subscribe()` to our `emit()` with event mapping
3. Keep our persistence logic (appendMessage on message_end)
4. Keep our model resolution logic
5. Keep our tool refresh logic (setActiveToolsByName)

**Estimated effort:** 3-5 days

### Phase 2: Implement proper compaction

Replace the `compact()` stub with real summarization-based compaction:

1. When compaction is triggered, call the LLM to summarize older messages
2. Replace summarized messages with a compact entry
3. Update `sessionManager` to handle compaction entries
4. Wire the frontend "Compact" button to this

**Implementation:** Port pi's `harness/compaction/compaction.ts` (200 lines)
which already exists in the vendor directory. It just needs to be wired up.

**Estimated effort:** 1-2 days

### Phase 3: Forward tool_execution_update events

**File:** `apps/server/src/ai/agent-session.ts:253-320`

Add event mapping for `tool_execution_update`:

```typescript
} else if (evt.type === "tool_execution_update") {
  this.emit({
    type: "tool_execution_update",
    toolCallId: evt.toolCallId,
    toolName: evt.toolName,
    partialResult: evt.partialResult,
  });
}
```

On the frontend, `ChatArea.tsx` should subscribe and update the tool call's
progress display in `ToolCallRow.tsx`.

**Estimated effort:** 0.5 days

### Phase 4: Implement proper navigateTree

Port pi's branch navigation from `harness/session/session.ts`:

1. Each branch stores its own message list
2. `navigateTree(targetId)` switches the active branch
3. The session manager tracks the branch tree
4. The frontend "Navigate" button uses this

**Note:** This is only used by the workspace file tree navigation. Evaluate
if it's needed before implementing.

**Estimated effort:** 1-2 days

## Risk Assessment

| Phase | Risk | Mitigation |
|-------|------|------------|
| 1 | Breaking AgentSession's public API (used everywhere) | Keep same public methods, delegate internally |
| 1 | Agent class behavior differs subtly | Write integration tests before/after |
| 2 | Compaction could lose context | Keep original messages until compaction is confirmed |
| 3 | Low risk | Simple event forwarding |
| 4 | Branch navigation is barely used | Evaluate: could be deprecated instead |

## Success Criteria

1. All existing tests pass (after adding them)
2. steer() and followUp() use separate queues
3. tool_execution_update events reach the frontend
4. compact() actually reduces context window
5. AgentSession.prompt() calls Agent.prompt() internally

## MoSCoW

- **Must**: Phase 3 (tool_execution_update) — 0.5 days
- **Should**: Phase 1 (Agent class) — 3-5 days
- **Could**: Phase 2 (compaction) — 1-2 days
- **Won't**: Phase 4 (navigateTree) — unless needed
