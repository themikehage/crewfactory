COMPLETED
# Agent Manager Tool - Implementation Plan

**Status:** Pending Implementation  
**Estimated effort:** 8-10 hours of agent work

---

## Goal

Implement an `agent_manager` tool that allows the orchestrator agent to delegate tasks to programmatic agents (defined in the system) and supervise their execution. Unlike `spawn_subagent` which creates ephemeral isolated sessions, `agent_manager` works with persistent programmatic agents that have their own workspaces, skills, and context.

---

## Overview

### Difference from spawn_subagent

| Aspect | spawn_subagent | agent_manager |
|--------|----------------|---------------|
| **Agent Type** | Ephemeral isolated session | Persistent programmatic agent |
| **Workspace** | Temporary subdirectory | Agent's own workspace |
| **Context** | Fresh, no memory | Agent's accumulated context |
| **Skills** | Inherits parent skills | Agent's own skills |
| **Persistence** | Session deleted after task | Agent persists across tasks |
| **Use Case** | Quick isolated tasks | Long-running agent work, specialized agents |

### Core Capabilities

1. **Delegate Task**: Send a task to a specific agent by ID
2. **Monitor Progress**: Check agent's current task status
3. **Get Results**: Retrieve task results when complete
4. **List Agents**: Show available agents and their status
5. **Abort Task**: Cancel a running task

---

## Architecture

### Backend Components

**1. Agent Manager Tool Definition**
- File: `apps/server/src/core/agent-manager-tool.ts`
- Creates tool with 5 actions: `delegate`, `status`, `result`, `list`, `abort`
- Integrates with existing `agentRegistry` to find and communicate with agents

**2. Agent Task Queue**
- File: `apps/server/src/core/agent-task-queue.ts`
- Manages pending/running/completed tasks per agent
- Persists task state in agent workspace (`tasks/` directory)
- Emits WebSocket events for real-time updates

**3. Agent Communication Protocol**
- Extend agent server API (`apps/server/src/agents/create-agent-server.ts`)
- Add endpoints:
  - `POST /api/agents/:id/task` - Assign new task
  - `GET /api/agents/:id/task/:taskId` - Get task status/result
  - `POST /api/agents/:id/task/:taskId/abort` - Abort task
  - `GET /api/agents/:id/tasks` - List all tasks

**4. WebSocket Integration**
- Extend `apps/server/src/ws/handler.ts`
- Add events:
  - `agent_task_start` - Task assigned to agent
  - `agent_task_update` - Task progress update
  - `agent_task_complete` - Task finished
  - `agent_task_error` - Task failed

### Frontend Components

**1. Agent Task Card**
- File: `apps/client/src/components/chat/tools/AgentTaskCard.tsx`
- Displays task assignment in chat
- Shows agent name, task description, status
- Real-time updates via WebSocket
- Expandable to show task logs

**2. Agent Task Console**
- File: `apps/client/src/components/chat/tools/AgentTaskConsole.tsx`
- Similar to SubagentConsole but for persistent agents
- Shows task history, current status, logs
- Formatted output with RichMarkdown

---

## Implementation Phases

### Phase 1: Backend Task Queue

**Task 1.1: Create agent task queue module**
- File: `apps/server/src/core/agent-task-queue.ts`
- Data structure:
```ts
interface AgentTask {
  id: string;
  agentId: string;
  parentSessionId: string;
  taskPrompt: string;
  status: "pending" | "running" | "completed" | "failed" | "aborted";
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: string;
  error?: string;
}
```
- Methods:
  - `createTask(agentId, parentSessionId, taskPrompt)` - Create new task
  - `getTask(taskId)` - Get task by ID
  - `getAgentTasks(agentId)` - Get all tasks for agent
  - `updateTaskStatus(taskId, status, result?)` - Update task
  - `persistTasks(agentId)` - Save to disk
  - `loadTasks(agentId)` - Load from disk

**Task 1.2: Persist task queue in agent workspace**
- Directory: `/tmp/crewfactory/{username}/agents/{agentId}/tasks/`
- File: `tasks.json` - Array of all tasks
- Load on agent startup, save on task state change

**Verification:** Task queue creates, persists, and retrieves tasks correctly.

---

### Phase 2: Agent Server API Extensions

**Task 2.1: Add task assignment endpoint**
- File: `apps/server/src/agents/create-agent-server.ts`
- Endpoint: `POST /api/agents/:id/task`
- Body: `{ taskPrompt: string, parentSessionId: string }`
- Logic:
  1. Create task in queue with status "pending"
  2. If agent is idle, start task immediately
  3. If agent is busy, queue task
  4. Return task ID

**Task 2.2: Add task status endpoint**
- Endpoint: `GET /api/agents/:id/task/:taskId`
- Returns: task object with status, result, logs

**Task 2.3: Add task list endpoint**
- Endpoint: `GET /api/agents/:id/tasks`
- Returns: array of all tasks for agent

**Task 2.4: Add task abort endpoint**
- Endpoint: `POST /api/agents/:id/task/:taskId/abort`
- Aborts running task, updates status to "aborted"

**Task 2.5: Implement task execution loop**
- When agent is idle and task is pending:
  1. Update task status to "running"
  2. Call `agentSession.prompt(taskPrompt)`
  3. On completion: update status to "completed", store result
  4. On error: update status to "failed", store error
  5. Emit WebSocket events for each state change

**Verification:** Can assign, monitor, and retrieve tasks via REST API.

---

### Phase 3: Agent Manager Tool Definition

**Task 3.1: Create agent-manager-tool.ts**
- File: `apps/server/src/core/agent-manager-tool.ts`
- Tool name: `agent_manager`
- Actions:

**Action 1: `delegate`**
```ts
{
  action: "delegate",
  agentId: string,
  task: string,
  priority?: "low" | "normal" | "high"
}
```
- Creates task in agent's queue
- Returns task ID and initial status

**Action 2: `status`**
```ts
{
  action: "status",
  taskId: string
}
```
- Returns current task status and progress

**Action 3: `result`**
```ts
{
  action: "result",
  taskId: string
}
```
- Returns task result (if completed)

**Action 4: `list`**
```ts
{
  action: "list",
  agentId?: string
}
```
- If agentId: list tasks for that agent
- If no agentId: list all available agents with their status

**Action 5: `abort`**
```ts
{
  action: "abort",
  taskId: string
}
```
- Aborts running task

**Task 3.2: Register tool in system**
- Add `agent_manager` to `AVAILABLE_TOOLS` in `packages/shared/src/schemas.ts`
- Inject tool in `session-manager.ts` (like spawn_subagent)
- Add to default tools in `ws/handler.ts`

**Task 3.3: Add tool to agent server**
- Inject `agent_manager` tool in `create-agent-server.ts`
- Agents can use it to delegate to other agents

**Verification:** Tool can be called and returns correct responses.

---

### Phase 4: WebSocket Integration

**Task 4.1: Emit task events from agent server**
- In task execution loop, emit events:
  - `agent_task_start` when task begins
  - `agent_task_update` on progress (optional, for long tasks)
  - `agent_task_complete` when done
  - `agent_task_error` on failure

**Task 4.2: Forward events to parent session**
- Use `broadcastToSession(parentSessionId, event)` pattern (like subagent)
- Events include taskId, agentId, status, result

**Task 4.3: Handle events in client**
- In `ChatArea.tsx`, subscribe to `agent_task_*` events
- Update AgentTaskCard components in real-time

**Verification:** WebSocket events flow from agent to client correctly.

---

### Phase 5: Frontend Components

**Task 5.1: Create AgentTaskCard component**
- File: `apps/client/src/components/chat/tools/AgentTaskCard.tsx`
- Props:
```ts
interface AgentTaskCardProps {
  taskId: string;
  agentId: string;
  agentName: string;
  task: string;
  status: "pending" | "running" | "completed" | "failed" | "aborted";
  result?: string;
  onOpenConsole: () => void;
}
```
- UI:
  - Agent avatar + name
  - Task description (truncated)
  - Status badge (color-coded)
  - "View Console" button
- Real-time updates via WebSocket

**Task 5.2: Create AgentTaskConsole component**
- File: `apps/client/src/components/chat/tools/AgentTaskConsole.tsx`
- Similar to SubagentConsole but for persistent agents
- Shows:
  - Agent info (name, workspace)
  - Task history (list of all tasks)
  - Current task details
  - Task logs (formatted with RichMarkdown)
- Fetch task history via REST API
- Listen to WebSocket events for real-time updates

**Task 5.3: Integrate in ToolCallRow**
- In `apps/client/src/components/chat/tools/ToolCallRow.tsx`
- Detect `agent_manager` tool calls
- Render AgentTaskCard for each action
- Add "Open Console" button to open AgentTaskConsole drawer

**Task 5.4: Add drawer to ChatArea**
- In `apps/client/src/components/chat/ChatArea.tsx`
- Add state for `agentTaskConsole` (similar to `subagentDrawer`)
- Render AgentTaskConsole in right drawer (AnimatePresence)

**Verification:** Cards render correctly, console opens, real-time updates work.

---

### Phase 6: Agent Instructions

**Task 6.1: Add agent_manager instructions to session-manager**
- In `apps/server/src/core/session-manager.ts`
- Add system prompt section explaining agent_manager tool
- Include examples of when to use it

**Task 6.2: Add agent_manager to factory skills**
- Create `factory-agent-manager` skill
- Teach the global director how to use agent_manager
- Include best practices for task delegation

**Task 6.3: Update AGENTS.md template**
- Add section about agent_manager tool
- Explain difference from spawn_subagent
- Provide usage examples

**Verification:** Agents understand and use agent_manager correctly.

---

### Phase 7: Testing and Polish

**Task 7.1: End-to-end test**
- Create test agent
- Use agent_manager to delegate task
- Monitor progress in real-time
- Verify result is returned correctly

**Task 7.2: Error handling**
- Test agent not found
- Test task abort
- Test task failure
- Verify error messages are clear

**Task 7.3: UI polish**
- Add loading states
- Add error states
- Add empty states
- Ensure responsive design

**Task 7.4: Documentation**
- Update `about.md` with agent_manager feature
- Update `steps.md` with Phase 70 tasks
- Add usage examples in docs

---

## Execution Order

```
Phase 1 (sequential):
  1.1 Create task queue module
  1.2 Persist task queue

Phase 2 (sequential, after Phase 1):
  2.1 Add task assignment endpoint
  2.2 Add task status endpoint
  2.3 Add task list endpoint
  2.4 Add task abort endpoint
  2.5 Implement task execution loop

Phase 3 (after Phase 2):
  3.1 Create agent-manager-tool.ts
  3.2 Register tool in system
  3.3 Add tool to agent server

Phase 4 (after Phase 3):
  4.1 Emit task events
  4.2 Forward events to parent
  4.3 Handle events in client

Phase 5 (after Phase 4):
  5.1 Create AgentTaskCard
  5.2 Create AgentTaskConsole
  5.3 Integrate in ToolCallRow
  5.4 Add drawer to ChatArea

Phase 6 (after Phase 5):
  6.1 Add instructions to session-manager
  6.2 Add to factory skills
  6.3 Update AGENTS.md template

Phase 7 (after Phase 6):
  7.1 End-to-end test
  7.2 Error handling
  7.3 UI polish
  7.4 Documentation
```

---

## Risk Mitigation

- **Backwards compatibility:** New tool, no changes to existing tools
- **Isolated changes:** Task queue is separate from agent registry
- **Gradual rollout:** Can test with single agent first
- **Error handling:** Robust error messages for all failure cases

---

## Files Modified Summary

**New files:**
- `apps/server/src/core/agent-task-queue.ts`
- `apps/server/src/core/agent-manager-tool.ts`
- `apps/client/src/components/chat/tools/AgentTaskCard.tsx`
- `apps/client/src/components/chat/tools/AgentTaskConsole.tsx`

**Modified files:**
- `packages/shared/src/schemas.ts` (add agent_manager to AVAILABLE_TOOLS)
- `apps/server/src/core/session-manager.ts` (inject tool, add instructions)
- `apps/server/src/agents/create-agent-server.ts` (add task endpoints, inject tool)
- `apps/server/src/ws/handler.ts` (add tool to defaults)
- `apps/server/src/core/default-factory-skills.ts` (add factory-agent-manager skill)
- `apps/client/src/components/chat/tools/ToolCallRow.tsx` (render AgentTaskCard)
- `apps/client/src/components/chat/ChatArea.tsx` (add AgentTaskConsole drawer)

---

## Usage Example

**Orchestrator agent workflow:**

```
User: "Analyze the codebase and create a test suite"

Orchestrator:
1. Calls agent_manager with action="list" to see available agents
2. Sees: "code-reviewer" agent, "test-writer" agent
3. Calls agent_manager with action="delegate", agentId="code-reviewer", task="Analyze src/ and identify critical paths"
4. Calls agent_manager with action="delegate", agentId="test-writer", task="Create test suite for critical paths"
5. Monitors with action="status" calls
6. Retrieves results with action="result" calls
7. Synthesizes results and responds to user
```

---

## Success Metrics

- **Functionality:** Can delegate, monitor, and retrieve tasks
- **Performance:** Tasks execute without blocking parent agent
- **UX:** Real-time updates, clear status indicators
- **Reliability:** Robust error handling, task persistence across restarts
