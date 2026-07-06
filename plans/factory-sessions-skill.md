# Plan: Factory Sessions Skill — Global Agent Session Management

## Goal
Create a factory skill (`factory-sessions`) that teaches the global agent how to list, inspect, send messages to, delete, and analyze sessions across all entity types (repos, agents, channels, experiments). The skill leverages existing REST API endpoints and the `delegate.ts` CLI script — no new backend endpoints needed.

## Context
The global agent currently has skills for repos, agents, channels, providers, env, integrations, observe, quick-actions, and skills management — but NO skill for session lifecycle management. The agent cannot introspect its own session history, analyze errors in past conversations, or proactively send follow-up messages to specific entity sessions.

## What the Skill Enables

| Capability | How | Existing API/Script |
|---|---|---|
| List all sessions | `GET /api/sessions` | Already exists, returns `SessionListItem[]` with `repoName`, `agentId`, `channelId`, `isExecution` filters |
| Filter by entity | Query param or client-side filter on list response | `metadata.json` per session already stores `repoName`, `agentId`, `channelId` |
| Get session messages | `GET /api/sessions/:id/messages` | Already exists |
| Send a message to a session | `POST /api/sessions/:id/prompt` or `delegate.ts` | Already exists |
| Delete a session | `DELETE /api/sessions/:id` | Already exists |
| Analyze errors/patterns | Read messages + execution logs, use LLM reasoning | Combine `GET /api/sessions/:id/messages` with `GET /api/agents/:id/executions/:execId` |
| List experiment sessions | `GET /api/experiments` + inspect variant `activeSessionId` | Already exists |

## Plan Steps

### Phase 64: Factory Sessions Skill

- [ ] 64.1 Create skill file at `workspace/.agents/skills/factory-sessions/SKILL.md` with frontmatter (`name`, `description`) and comprehensive instructions covering:
  - Listing sessions (all, by repo, by agent, by channel, by experiment)
  - Reading session messages and metadata
  - Sending follow-up messages to specific sessions
  - Deleting sessions (single and bulk by entity)
  - Analyzing session data for errors, bottlenecks, and improvement opportunities
  - Cross-referencing execution logs with session history
- [ ] 64.2 Register `factory-sessions` in `DEFAULT_FACTORY_SKILLS` (`apps/server/src/core/default-factory-skills.ts`) so it auto-provisions for all users
- [ ] 64.3 Add session analysis patterns section to the skill:
  - Error detection: scan messages for `agent_error` events, failed tool calls (`isError: true`)
  - Bottleneck detection: identify long tool execution times from `tool_execution_start`/`tool_execution_end` pairs
  - Pattern detection: repeated error sequences, redundant tool calls, context window saturation
  - Improvement suggestions: correlate errors with tool permissions, model choice, and prompt structure
- [ ] 64.4 Add experiment session introspection guide:
  - List experiments via `GET /api/experiments`
  - For each variant, read messages from the `activeSessionId` session
  - Compare variant outputs and judge scores
  - Identify which configuration produced better results
- [ ] 64.5 Verify skill loads correctly — start dev server, confirm skill appears in agent's skill list
- [ ] 64.6 Update `about.md` and `steps.md`

## Skill Content Design

The SKILL.md will use curl examples with `$TOKEN` (already injected into bash env by session-manager spawnHook) and follow the same pattern as existing factory skills. Key sections:

1. **Session Discovery** — list all, filter by entity type
2. **Session Inspection** — read messages, metadata, tool calls
3. **Session Interaction** — send prompts, steer active sessions
4. **Session Cleanup** — delete individual or bulk sessions
5. **Error Analysis** — systematic approach to finding and categorizing errors
6. **Performance Analysis** — token usage, execution time, tool efficiency
7. **Experiment Analysis** — compare variant sessions, judge scores, identify winners
8. **Proactive Monitoring** — patterns to watch for, when to alert the user

## Dependencies
- No new backend code required — all APIs exist
- No new client code required
- Skill auto-provisions via `DEFAULT_FACTORY_SKILLS` mechanism

## Risk Assessment
- **Low risk**: Purely additive, no changes to existing endpoints or behavior
- The skill is documentation-only (SKILL.md) — it teaches the agent to use existing tools
- `$TOKEN` is already available in bash env for all agent sessions
