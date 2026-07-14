## Phase 86: Rebuild Channel Org Chart with @xyflow/react
- [x] 86.1 Install @xyflow/react and configure stylesheet in index.css
- [x] 86.2 Build AgentDetailPanel slide-over/bottom-sheet details configuration
- [x] 86.3 Create AgentFlowNode custom ReactFlow node displaying streaming activity
- [x] 86.4 Implement OrgFlowCanvas layered auto-positioning ReactFlow graph
- [x] 86.5 Implement OrgFlowMobile responsive layout list container
- [x] 86.6 Update ChannelDetailPage and ChannelChatArea to mount first-level Org Chart tab
- [x] 86.7 Remove obsolete SVG/static hierarchy files and verify compilation

## Phase 87: Dynamic Default Model Resolution
- [x] 87.1 Remove hardcoded `DEFAULT_MODEL` constant from shared package and delete `packages/shared/src/model.ts`
- [x] 87.2 Update client translation literals (`AgentsPage.literals.ts`) to use generic illustrative placeholders instead of `DEFAULT_MODEL`
- [x] 87.3 Update backend execution scripts, routing fallback handlers, and tool schemas to resolve fallback models using `sessionManager.getUserDefaultModel(username)` dynamically
- [x] 87.4 Verify successful client/server compilation and TypeScript typecheck build

## Phase 88: Fix Laboratory Run Button and Variant 404 Error
- [x] 88.1 Render RunExperimentModal globally in AppRouter.tsx and clean up page props in client
- [x] 88.2 Recreate missing lab variant channels dynamically on GET /api/channels/:id in server
- [x] 88.3 Verify successful client/server compilation build

## Phase 89: Fix AskQuestionForm Validation & Custom Answer Display
- [x] 89.1 Fixed validation to block empty submission when `allowCustom` is false (missing option selection)
- [x] 89.2 Force `showCustom = true` when `options` array is empty so user can always type a response
- [x] 89.3 Created `plans/thinking-preview-line.md` for animated thinking preview feature

## Phase 90: Fix Agent Avatar 401 Unauthorized
- [x] 90.1 Moved GET /api/agents/:id/avatar route before authMiddleware in agents.ts so browser `<img>` tags can authenticate via `?token=` query param (supported by `getUsername()`)
- [x] 90.2 Updated `AgentAvatar.tsx` to append `?token=` to avatar URLs for authenticated image loading
- [x] 90.3 Created `plans/laboratory-sessions.md` covering both the lab session leakage fix and dedicated view

## Phase 91: Plans (Channel Features Removal + Info/Edit Button)
- [x] 91.1 Created `plans/remove-channel-features.md` — Tasks/Optimize/Benchmark removal from channels
- [x] 91.2 Created `plans/info-edit-button.md` — Info/Edit button for projects and agents

## Phase 92: Plan (Mobile Bottom Bar Redesign)
- [x] 92.1 Created `plans/mobile-bottom-bar-redesign.md` — Bottom bar only visible when drawer is open
- [x] 92.2 Implemented: simplified MobileBottomBar visibility to `{sidebarOpen && ...}`, adjusted `<main>` positioning to `sidebarOpen ? "bottom-14" : "bottom-0"`, removed unused `isChatActive` variable

## Phase 94: Remove Channel Features (Tasks, Optimize, Benchmark)
- [x] 94.1 Remove shared types (ScoringMetric, ScoringRubric, ChannelBenchmarkConfig from schemas.ts; benchmark paths from paths.ts)
- [x] 94.2 Delete server benchmark module (apps/server/src/benchmark/)
- [x] 94.3 Remove Task Ledger (task-ledger.ts, channel-store, orchestrator, index exports)
- [x] 94.4 Remove benchmark/optimize/ledger routes and auto-trigger from channels.ts
- [x] 94.5 Delete client components (ChannelTaskLedger, ChannelBenchmarkPanel, ChannelOptimizePanel, BenchmarkLiveTab)
- [x] 94.6 Clean client integrations (ChannelChatArea, AgentDetailPanel, ChannelSettingsModal, ChannelOrgTab)
- [x] 94.7 Delete CLI script (scripts/benchmark.ts)
- [x] 94.8 Clean about.md references and verify compilation

## Phase 94: Layered Prompt System Implementation
- [x] 94.1 Create prompt layer fragments under `core/prompts/fragments/` (identity, role, instance, protocol)
- [x] 94.2 Build `PromptFragmentRegistry` and `PromptComposer` to layer prompts conditionally
- [x] 94.3 Integrate `PromptComposer` in `SessionPromptBuilder` and `ChannelOrchestrator`, making prompt composition dynamic
- [x] 94.4 Refactor `ChannelOrchestrator.buildAgentPrompt` to only build chronology text
- [x] 94.5 Refactor Lab Architect system prompt for identity-only guidelines
- [x] 94.6 Implement `layered-prompt.test.ts` unit tests and verify successful project builds
- [x] 94.7 Fix `ReferenceError` by declaring `workspaceDir` from `agentEntry.server.session.cwd` in `ChannelOrchestrator.runAgentPrompt`

## Phase 95: WebSocket Reconnect & Token Usage UI
- [x] 95.1 Implement server-side ping-pong interval and immediate context stats sync on ws subscription
- [x] 95.2 Refactor backend `getContextUsage` to use `estimateContextTokens` for accurate LLM counts
- [x] 95.3 Add `MessageUsage` and `ContextUsage` to client shared types and re-export them from index.ts
- [x] 95.4 Implement offline message queue in client `WsClient`, reply to server pings, and clear queue on disconnect
- [x] 95.5 Destructure connection status in `ChatArea.tsx` and implement silent auto-refresh of messages on reconnect
- [x] 95.6 Display provider, model, tokens, and cost on all completed assistant messages in `MessageList.tsx`
- [x] 95.7 Render `ContextIndicator` and `ContextProgressLine` props using real tokens in `InputToolbar.tsx` and `InputCard.tsx`
- [x] 95.8 Verify clean compilation build of apps/server and apps/client

## Phase 96: Image Vision & Generation Tools
- [x] 96.1 Copy vendored AI packages from scratch workspace (image-models, openrouter-images, api loaders) to apps/server/src/ai/vendor/ai
- [x] 96.2 Propagate `input` property in `model-registry.ts` and set it inside `modelObj` in `agent-session.ts`
- [x] 96.3 Support base64 image decoding and parsing inside `AgentSession.prompt()` to enable multimodal vision input in chat
- [x] 96.4 Create new official `vision` and `generate_image` tools using user settings-based configurations
- [x] 96.5 Integrate tools in `ui-tools.ts`, `session-manager.ts`, `spawn-subagent-tool.ts`, and `ws/handler.ts`
- [x] 96.6 Add UI selectors for Vision and Image Gen Models in settings `GeneralTab.tsx` and save to `/api/settings`
- [x] 96.7 Render visual "Vision" badges in `ModelSelector.tsx` for vision-capable models
- [x] 96.8 Support inline image rendering for `generate_image` results in `ToolCallRow.tsx`
- [x] 96.9 Verify clean compilation build of apps/server and apps/client

## Phase 97: Model Diagnostic Testing Tools
- [x] 97.1 Refactor `vision-tool.ts` to extract `runVisionModel` and prevent code duplication
- [x] 97.2 Refactor `image-gen-tool.ts` to extract `runImageGenModel` and prevent code duplication
- [x] 97.3 Implement backend diagnostic testing API endpoints (`/api/settings/test-vision` and `/api/settings/test-image-gen`)
- [x] 97.4 Implement Vision and Image Generation Diagnostic UI panels in `GeneralTab.tsx` with upload/default image selection and live previews
- [x] 97.5 Verify successful client and server compilation build

## Phase 99: Thinking Preview Line
- [x] 99.1 Create MessageBlocks.literals.ts with localized "hideReasoning" strings (en/es)
- [x] 99.2 Refactor ThinkingBlock to show compact single-line preview when closed (icon + truncated text, border-l-2 pulse during streaming)
- [x] 99.3 Pass isStreaming prop from MessageList.tsx to ThinkingBlock for live streaming state
- [x] 99.4 Verify successful client and server compilation build

## Phase 98: Robust Chat Attachments Flow
- [x] 98.1 Implement image/document storage persistence in localStorage and recovery upon session creation inside ChatArea.tsx
- [x] 98.2 Configure allowAttachments inside ChatArea's WelcomeChatInput when !sessionId
- [x] 98.3 Propagate upload errors in processAttachments and handle inline reading of small text/code attachments inside ChatInput.tsx
- [x] 98.4 Wrap processAttachments with try-catch and show Toast notifications inside ChatInput and ChatArea components
- [x] 98.5 Adjust ImageGrid max-width to 550px inside MessageList.tsx for better layouts
- [x] 98.6 Fix manual project workspace directory calculation inconsistency in upload route, and append safe filename if destination resolves to a directory inside files.ts
- [x] 98.7 Verify compilation build of client and server apps

## Phase 100: Recover File System Tools (read, write, edit, grep, find, ls)
- [x] 100.1 Install npm `diff` dependency in apps/server for precise file patch diffing
- [x] 100.2 Implement directory traversal safety guard in `path-safety.ts` to secure agent operations
- [x] 100.3 Create `edit-diff.ts` utility supporting normalized smart-replacements and diff format generation
- [x] 100.4 Port filesystem tools (`read`, `write`, `edit`, `grep`, `find`, `ls`) with hybrid execution support (system tools + pure Node fallbacks)
- [x] 100.5 Export tool definitions in `ai/index.ts` and register them inside `SessionToolFactory.createSessionTools`
- [x] 100.6 Verify successful Bun server bundling and clean compilation

## Phase 101: Unified Factory Operations Tool
- [x] 101.1 Implement automated schema validation using FACTORY_CONTRACTS inside apps/server/src/core/tools/factory-tool.ts
- [x] 101.2 Implement automatic websocket entity updates broadcast on state mutations
- [x] 101.3 Create unit and integration test coverage for contracts and tools execution and verify clean build

## Phase 102: Fast Task Decomposition & Channel Agent Validation
- [x] 102.1 Replace plan session creation in `decompose_tasks` tool execution with direct `streamSimple` call
- [x] 102.2 Implement cascade cleanup of deleted agent IDs from user channels in DELETE /api/agents/:id
- [x] 102.3 Implement ghost members filter on channel read (GET / and GET /:id) in backend
- [x] 102.4 Implement visual warning styles, warning labels, and badges for missing agents in the frontend (canvas flow, mobile list, members panel, detail panel, modals)
- [x] 102.5 Verify successful compilation and builds for server and client
## Phase 103: Resolve Critical Fixes (C1, C2, C6, C8, C9, C10)
- [x] 103.1 Fix exception handling in AgentSession catch block and emit messages on agent_end
- [x] 103.2 Split delegationResultQueue into steeringQueue and followUpQueue in AgentSession
- [x] 103.3 Delete unused/broken providers/all.ts and agent/node.ts files
- [x] 103.4 Define OAuthCredentials locally in auth/types.ts and remove ts-nocheck from auth/types.ts and resolve.ts
- [x] 103.5 Clean up broken options imports and remove ts-nocheck from types.ts
- [x] 103.6 Fix associated build/typecheck errors in agent-session.ts, metadata-store.ts and decompose-tool.ts

## Phase 104: Resolve High Severity Fixes (H1, H2, H3, H4, H5)
- [x] 104.1 Wrap prompt pre-loop setup in try-catch-finally in agent-session.ts (H1)
- [x] 104.2 Prevent steer/followUp message duplication by removing appendMessage from steer/followUp and handling custom messages in loop callback (H3)
- [x] 104.3 Replace bare catch blocks with console.error logs in handler.ts to protect WS pipeline (H4)
- [x] 104.4 Add navigate tree streaming guard in agent-session.ts (H2)
- [x] 104.5 Track/deduplicate client updates using responseId/id in ChatArea.tsx (H5)
- [x] 104.6 Verify successful compilation build of client and server apps

## Phase 105: Refactor AgentSession & Adoption of Agent Class
- [x] 105.1 Refactored session-persistence.ts to accept custom firstKeptEntryId in appendCompaction
- [x] 105.2 Refactored AgentSession to delegate to the vendor Agent class internally
- [x] 105.3 Subscribed to tool_execution_update events and forwarded them locally in ChatArea.tsx
- [x] 105.4 Passed compaction state and callbacks from ChatArea -> ChatInput -> InputToolbar -> ContextIndicator
- [x] 105.5 Added Zap button for context compaction inside ContextIndicator.tsx
- [x] 105.6 Subscribed to tool-update event and rendered progressive logs in ToolCallRow.tsx
- [x] 105.7 Added unit tests covering AgentSession initialization, prompt execution, steering, and compaction in agent-session.test.ts
- [x] 105.8 Verified successful compilation and execution of client and server builds and tests

## Phase 106: Robust AskQuestionForm and ApprovalForm
- [x] 106.1 Add WebSocket state validation, ui_action_error handler, and 15s reset timeout to AskQuestionForm.tsx
- [x] 106.2 Add WebSocket state validation, ui_action_error handler, and 15s reset timeout to ApprovalForm.tsx
- [x] 106.3 Refactor ChatArea.tsx tool_execution_end subscriber and MessageList.tsx mapping to unify tool result roles under 'toolResult' and prevent duplicate items
- [x] 106.4 Validate production compilation of client application

## Phase 107: Robust Delegation and Subagent Messaging
- [x] 107.1 Refactor delegation results to use 'toolResult' role with English notification content (C1 + X1)
- [x] 107.2 Implement duplicate delegation prevention and catch guards in DelegationRegistry (H1 + L1)
- [x] 107.3 Add parent session validation logs and safe event subscription handlers in subagent/delegation processes (H2 + H3)
- [x] 107.4 De-duplicate wake messages and limit full history logging context footprint (M1 + M2)
- [x] 107.5 Integrate FloatingDelegations in ChatArea with global WS updates and sanitize URL route keys (M3 + M4 + L2)
- [x] 107.6 Validate complete build compilation on server and client packages

## Phase 108: Robust Chat Input Focus Hook
- [x] 108.1 Create useChatInputFocus.ts custom hook for managing React textarea focus triggers
- [x] 108.2 Modify WelcomeChatInput.tsx and ChatInput.tsx to propagate textareaRef with fallback to local useRef
- [x] 108.3 Integrate useChatInputFocus hook in ChatArea.tsx and bind ref to input components
- [x] 108.4 Verify client build and compilation builds successfully

## Phase 109: Native Delegation followUp and continue resume
- [x] 109.1 Implement `continue()` method in `AgentSession` and modify `addDelegationResult()` to use `followUp` in `agent-session.ts`
- [x] 109.2 Update `delegate-tool.ts` to resume parent via `parent.continue()` instead of `parent.prompt(wakeMessage)`
- [x] 109.3 Update `spawn-subagent-tool.ts` to resume parent via `parent.continue()` instead of `parent.prompt(wakeMessage)`
- [x] 109.4 Validate clean compilation check and verify type safety

## Phase 110: Decompose Tasks Robustness & Cache Layer
- [x] 110.1 Implement `TaskStateManager` with in-memory caching, atomic write operations, and Zod schemas validation
- [x] 110.2 Integrate `TaskStateManager` in `decompose-tool.ts` and clamp `maxTasks` range
- [x] 110.3 Integrate `TaskStateManager` in `update-task-tool.ts`, handling abort signals, deadlocks, and validation checks
- [x] 110.4 Refactor `prompt-builder.ts` to use cached task state and prevent redundant disk I/O per agent turn
- [x] 110.5 Verify successful type checking and compilation on client and server

## Phase 111: Decouple Task Planning from `decompose_tasks` Tool
- [x] 111.1 Modify parameter schema of `decompose_tasks` tool to receive pre-split `tasks` list array directly
- [x] 111.2 Refactor execute method to register plan instantly and drop nested `streamSimple` call
- [x] 111.3 Update system guidelines in `default-factory-skills.ts` to guide models to pre-split tasks in their own ReAct loop
- [x] 111.4 Compile, build, and verify server/client type safety

## Phase 112: Permission Engine & Sandboxing (Phase 1)
- [x] 112.1 Update CreateAgentSessionOptions in agent-session.ts to support beforeToolCall forwarding to Agent constructor
- [x] 112.2 Implement PermissionEngine stateless module under apps/server/src/core/sandbox/permission-engine.ts with default deny and ask rules
- [x] 112.3 Add sandbox barrel exports under apps/server/src/core/sandbox/index.ts
- [x] 112.4 Wire beforeToolCall hook in session-manager.ts to evaluate rules and pause-on-ask using uiApprovalRegistry and WebSocket broadcast
- [x] 112.5 Capture tool_approval_request WebSocket events in client ChatArea.tsx and map them as a custom message role
- [x] 112.6 Create interactive ToolApprovalCard in MessageList.tsx allowing inline Approve/Deny actions with auto-disable
- [x] 112.7 Verify successful compilation and build check for client and server






## Phase 113: Decompose SessionManager & Clean Up Passthroughs
- [x] 113.1 Create modular helper modules: workspace-resolver, tool-activation-engine, session-event-publisher, before-tool-call-hook, session-memory-enricher, agent-definition-resolver
- [x] 113.2 Refactor getOrCreateSession in session-manager.ts to delegate to new sub-modules
- [x] 113.3 Remove passthrough methods and expose public readonly sub-managers on SessionManager
- [x] 113.4 Migrate all 26+ callers of old delegate methods to use new properties directly
- [x] 113.5 Unify model resolution across channel-orchestrator.ts and judge.ts using resolveModelWithFallback
- [x] 113.6 Verify clean compilation and successful builds for both server and client packages

## Phase 114: Decompose ChannelOrchestrator
- [x] 114.1 Create deployment-context.ts shared utility and update prompt-builder.ts
- [x] 114.2 Create ChannelMessagePublisher factory and message-publisher.ts
- [x] 114.3 Create ResponseParser and response-parser.ts
- [x] 114.4 Create ChannelNegotiationHandler and channel-negotiation-handler.ts
- [x] 114.5 Create AgentPromptRunner and agent-prompt-runner.ts
- [x] 114.6 Refactor ChannelOrchestrator to thin coordinator delegating to new helper modules
- [x] 114.7 Resolve circular dependency between agent-registry.ts and channel-orchestrator.ts using callback registration
- [x] 114.8 Verify clean compilation and successful builds for both server and client packages

## Phase 115: Unify Lab-Channel Orchestration
- [x] 115.1 Add token collection utility `collectChannelTokens` under `core/agent-utils.ts`
- [x] 115.2 Create shared orchestration types under `channels/types.ts`
- [x] 115.3 Implement `runToCompletion` method in `ChannelOrchestrator` to automate setup, execution, and teardown
- [x] 115.4 Refactor `ExperimentRunner` to remove obsolete `runSingleVariant` and `runMultiVariant` duplicate methods and delegate to `channelOrchestrator.runToCompletion`
- [x] 115.5 Verify successful compilation and builds for both server and client packages

## Phase 116: Centralize Prompt Assembly
- [x] 116.1 Create `apps/server/src/core/prompts/prompt-assembly.ts` containing the centralized `assemblePromptAppends` factory and its modes
- [x] 116.2 Refactor `SessionPromptBuilder` to delegate to `assemblePromptAppends` in `standard-session` mode
- [x] 116.3 Refactor `AgentPromptRunner` to delegate to `assemblePromptAppends` in `channel-member` mode
- [x] 116.4 Fix `createAgentServer` prompt composition bug by delegating to `assemblePromptAppends` in `agent-startup` mode
- [x] 116.5 Refactor `spawn_subagent` tool to delegate to `assemblePromptAppends` in `subagent-spawn` mode and remove duplicate inline string structures
- [x] 116.6 Verify successful compilation, strict typecheck, and production builds of both client and server packages

## Phase 117: Extract useConnectionAwareEffect Hook
- [x] 117.1 Create useConnectionAware.ts custom React hook
- [x] 117.2 Refactor useWebSocket.ts to use the new hook
- [x] 117.3 Refactor useChannel.ts to use the new hook and split message/state connection effects
- [x] 117.4 Verify successful client build compilation
## Phase 118: Info/Edit Button for Projects & Agents
- [x] 118.1 Extend backend endpoints to return and patch project details (`cloneUrl`, `createdAt`, `diskPath`)
- [x] 118.2 Implement inline `ProjectInfoModal` details/editing panel on `DashboardPage` and add translations
- [x] 118.3 Add collapsible Advanced Configuration drawer with checkboxes for `serialTools` inside `RegisterModal` and add translations
- [x] 118.4 Move implemented plan to completed folder and verify client/server compilations

## Phase 119: Better Auth Integration & First-Run Onboarding
- [x] 119.1 Install better-auth and configure SQLite native database schema initialization dynamically in db.ts
- [x] 119.2 Implement username-based register and login flows with emailAndPassword authentication
- [x] 119.3 Implement /api/auth/status checking first-run and active sessions
- [x] 119.4 Rewrite AuthContext to support httpOnly cookie credentials and three-way loading state routing
- [x] 119.5 Create OnboardingPage welcome form for admin account registration
- [x] 119.6 Migrate all client fetch operations to apiFetch and eliminate localStorage raw JWT token dependency
- [x] 119.7 Replace server process.env.JWT_SECRET usages with persistent database-generated auth.options.secret
- [x] 119.8 Implement synchronous session token lookup and programmatic session token generation for subprocess environments in auth/onboarding.ts
- [x] 119.9 Verify 100% production compilation builds and clean typechecking of apps/server and apps/client

## Phase 120: Robust API Error Detection and Surfacing
- [x] 120.1 Implement `sanitizeUserErrorMessage` in `error-body.ts` to clean provider error message strings
- [x] 120.2 Handle empty message validations as errors in `openai-completions.ts` and `agent-loop.ts`
- [x] 120.3 Update `lazy.ts` to sanitize lazy setup error messages
- [x] 120.4 Update `agent-session.ts` catch blocks to persist throws, update context, and emit events
- [x] 120.5 Update client `ChatArea.tsx` and `MessageList.tsx` to handle, clear, and display custom API error cards
- [x] 120.6 Verify monorepo builds and compile targets cleanly

## Phase 121: Better Auth WS Debt Payoff (Professional Implementation)
- [x] 121.1 Remove manual CREATE TABLE from auth/db.ts, implement auth/migrate.ts with getMigrations/runMigrations and ensureAuthTables() on startup
- [x] 121.2 Refactor auth/onboarding.ts to use Better Auth plugin (programmaticSessionPlugin) via auth.api.createProgrammaticSession with fallback raw insert using randomUUID id, remove table ownership
- [x] 121.3 Refactor lib/auth-helpers.ts to single source of truth: extractToken without split('.'), SESSION_COOKIE_KEYS with __Secure- prefix, validateSessionFromHeaders via auth.api.getSession primary + sync DB fallback, shared parseExpiresAt/isExpired
- [x] 121.4 Create ws/registry.ts (no global counter, no mutation, explicit cleanup) and ws/factory.ts (closure-captured wsId via crypto.randomUUID(), structured logger, transactional auto-subscribe on prompt)
- [x] 121.5 Rewrite ws/handler.ts as compatibility shim + broadcast façade backed by registry, remove wsCounter/getWsIdFromContext loops and ws.wsId mutation
- [x] 121.6 Update index.ts WS route to use factory pattern (createWsContext with rawHeaders closure) and run ensureAuthTables() before serving
- [x] 121.7 Remove legacy token prop drilling from SettingsPage and 5 tab components, remove localStorage fallback from apiFetch and ws-client, verify grep 0
- [x] 121.8 Fix PreviewPanel to reuse wsClient singleton for preview_status/preview_build_log, remove separate new WebSocket()
- [x] 121.9 Implement robust offline queue (max 50, drop oldest with warning, isConnected guard) in ws-client.ts and dedup logic in useConnectionAwareEffect (dep-key + wasConnected tracking)
- [x] 121.10 Create ws/logger.ts structured logger, update about.md with WS cookie auth flow docs, add unit tests for auth-helpers and ws/factory (48 tests passing)
- [x] 121.11 Verify production builds (client + server) and all acceptance criteria

## Phase 122: Real-Time Session Visualization (Kanban, Sidebar Status, Org Chart)
- [x] 122.1 Create centralized `SessionsContext` + `useSessions` hook with WebSocket live status merging
- [x] 122.2 Add `/sessions` route to router and wire `SessionsProvider` in `AppRouter`
- [x] 122.3 Create `SessionsKanbanPage` with idle/working/done kanban columns
- [x] 122.4 Add session status dots to agents in `SessionSidebar` (like Slack)
- [x] 122.5 Add session status dots to channel members in `MembersPanel`
- [x] 122.6 Add session status indicators to `OrgFlowCanvas` and `OrgFlowMobile` node data
- [x] 122.7 Add "Session Board" navigation link in sidebar admin section
- [x] 122.8 Verify successful client compilation build

## Phase 123: Hackathon Submission Assets (Qwen Cloud — Track 3 Agent Society)
- [x] 123.1 Create gitignored assets/hackathon/ folder for screenshots and raw recordings
- [x] 123.2 Create README.md with track identification, feature overview, architecture summary, and quick start
- [x] 123.3 Create docs/architecture.md with Mermaid diagram showing Qwen Cloud → backend → frontend data flow
- [x] 123.4 Create alibaba-cloud/deployment-proof.md documenting DashScope API usage and OSS upload utility
- [x] 123.5 Create apps/server/src/alibaba-cloud/log-upload.ts OSS upload utility for benchmark reports
- [x] 123.6 Add ALIBABA_ACCESS_KEY_ID/SECRET and OSS_BUCKET/REGION env vars to .env.example and docker-compose.yml
- [x] 123.7 Create docs/demo-script.md with timestamped 3-minute walkthrough
- [x] 123.8 Create docs/blog-post.md draft for Medium/dev.to bonus prize
- [x] 123.9 Create plans/testing-hackathon.md with tiered test plan (negotiation, scoring, MCP, E2E)
- [ ] 123.10 Record demo video <3 min, upload to YouTube unlisted, add link to README
- [ ] 123.11 Deploy to Alibaba Cloud (ECS/Function Compute), add screenshots to deployment-proof.md
- [ ] 123.12 Implement tests per plans/testing-hackathon.md (31+ tests across negotiation, scoring, MCP, WS)
- [ ] 123.13 Publish blog post on Medium/dev.to, add link to Devpost submission
- [ ] 123.14 Submit on Devpost with all required fields and assets

## Phase 124: Layered Prompt System Audit Improvements
- [x] 124.1 Create `role-senior.ts` and `role-observer.ts` fragments with proper protocol and silent mode behavior
- [x] 124.2 Update `registry.ts` and `composer.ts` to map and load senior and observer prompt roles
- [x] 124.3 Implement single-leader enforcement on backend (POST/PATCH member endpoints returning 409 status code)
- [x] 124.4 Update frontend `AgentDetailPanel.tsx`, `AddMemberModal.tsx`, and `ChannelMembersModal.tsx` to disable/prevent multiple lead selection
- [x] 124.5 Inject agent-specific `selfReplyMode` and channel `leaderName` into DeploymentContext and substitute inside target/broadcast prompt fragments
- [x] 124.6 Enrich roster presentation showing member replyMode inside the composer logic
- [x] 124.7 Unify arbiter check prioritizing `negotiationProtocol.arbiterAgentId` configuration over default lead role
- [x] 124.8 Update unit tests inside `layered-prompt.test.ts` to cover new role prompt mappings and verify clean typecheck builds

## Phase 125: WebFetch Tool (Security & Performance)
- [x] 125.1 Implement core security layer (security.ts) blocking SSRF and DNS Rebinding
- [x] 125.2 Implement content extraction pipeline (extractor.ts) with readability, turndown, and regex fallback
- [x] 125.3 Implement caching layer with TTL and LRU eviction (cache.ts) and sliding window rate limiter (rate-limiter.ts)
- [x] 125.4 Define custom tool interface and execute pipeline (web-fetch-tool.ts) and register in SessionToolFactory
- [x] 125.5 Integrate web_fetch in AVAILABLE_TOOLS schema, tool activation engine, WS factory, and server routing permissions
- [x] 125.6 Build custom WebFetchResult React component and integrate in ToolsSelector and ToolCallRow
- [x] 125.7 Verify builds and SSRF protection layer successfully

## Phase 126: Channel Non-Streaming Render (Buffer Mode)
- [x] 126.1 Add streamingRenderMode field to shared schemas (Channel, CreateChannel, UpdateChannel)
- [x] 126.2 Persist streamingRenderMode field in the server-side channel-store
- [x] 126.3 Add streamingRenderMode dropdown selector to ChannelSettingsModal and support translations
- [x] 126.4 Update ChannelMessageList mapping logic to respect streamingRenderMode and conditionalize activeStreamList rendering
- [x] 126.5 Update ChannelMessages mapping logic and add typing indicator when streamingRenderMode is 'complete'
- [x] 126.6 Add typing indicator bar in ChannelChatArea above the ChatInput in complete mode
- [x] 126.7 Pass streamingRenderMode prop from ChannelDetailPage to ChannelMessages
- [x] 126.8 Verify clean compilation and successful builds of apps/server and apps/client

## Phase 127: Laboratory Efficiency Audit
- [x] 127.1 Normalise scoring formula by agent count and implement logarithmic ratio penalty
- [x] 127.2 Implement early-exit score parsing fast check and sliding window scans in DivergenceDetector
- [x] 127.3 Implement experiment-member prompt assembly mode and minimal LAB_APPEND_INSTRUCTIONS
- [x] 127.4 Add prompt caching and skip reload scans for laboratory channels
- [x] 127.5 Implement pre-LLM silent bypass check for observers and non-mentioned agents
- [x] 127.6 Add output-format prompt fragments (full-proposal, diff-suggestion, normal) as Capa 5
- [x] 127.7 Enforce diff suggestion formats using custom initial courtesy string stripper post-processors
- [x] 127.8 Integrate outputMode configuration option dropdown in AgentDetailPanel client view
- [x] 127.9 Verify clean compilation and successful workspace builds

## Phase 128: Fix Laboratory Multi-Agent Participation
- [x] 106.1 Add WebSocket state validation, ui_action_error handler, and 15s reset timeout to AskQuestionForm.tsx
- [x] 106.2 Add WebSocket state validation, ui_action_error handler, and 15s reset timeout to ApprovalForm.tsx
- [x] 106.3 Refactor ChatArea.tsx tool_execution_end subscriber and MessageList.tsx mapping to unify tool result roles under 'toolResult' and prevent duplicate items
- [x] 106.4 Validate production compilation of client application

## Phase 107: Robust Delegation and Subagent Messaging
- [x] 107.1 Refactor delegation results to use 'toolResult' role with English notification content (C1 + X1)
- [x] 107.2 Implement duplicate delegation prevention and catch guards in DelegationRegistry (H1 + L1)
- [x] 107.3 Add parent session validation logs and safe event subscription handlers in subagent/delegation processes (H2 + H3)
- [x] 107.4 De-duplicate wake messages and limit full history logging context footprint (M1 + M2)
- [x] 107.5 Integrate FloatingDelegations in ChatArea with global WS updates and sanitize URL route keys (M3 + M4 + L2)
- [x] 107.6 Validate complete build compilation on server and client packages

## Phase 108: Robust Chat Input Focus Hook
- [x] 108.1 Create useChatInputFocus.ts custom hook for managing React textarea focus triggers
- [x] 108.2 Modify WelcomeChatInput.tsx and ChatInput.tsx to propagate textareaRef with fallback to local useRef
- [x] 108.3 Integrate useChatInputFocus hook in ChatArea.tsx and bind ref to input components
- [x] 108.4 Verify client build and compilation builds successfully

## Phase 109: Native Delegation followUp and continue resume
- [x] 109.1 Implement `continue()` method in `AgentSession` and modify `addDelegationResult()` to use `followUp` in `agent-session.ts`
- [x] 109.2 Update `delegate-tool.ts` to resume parent via `parent.continue()` instead of `parent.prompt(wakeMessage)`
- [x] 109.3 Update `spawn-subagent-tool.ts` to resume parent via `parent.continue()` instead of `parent.prompt(wakeMessage)`
- [x] 109.4 Validate clean compilation check and verify type safety

## Phase 110: Decompose Tasks Robustness & Cache Layer
- [x] 110.1 Implement `TaskStateManager` with in-memory caching, atomic write operations, and Zod schemas validation
- [x] 110.2 Integrate `TaskStateManager` in `decompose-tool.ts` and clamp `maxTasks` range
- [x] 110.3 Integrate `TaskStateManager` in `update-task-tool.ts`, handling abort signals, deadlocks, and validation checks
- [x] 110.4 Refactor `prompt-builder.ts` to use cached task state and prevent redundant disk I/O per agent turn
- [x] 110.5 Verify successful type checking and compilation on client and server

## Phase 111: Decouple Task Planning from `decompose_tasks` Tool
- [x] 111.1 Modify parameter schema of `decompose_tasks` tool to receive pre-split `tasks` list array directly
- [x] 111.2 Refactor execute method to register plan instantly and drop nested `streamSimple` call
- [x] 111.3 Update system guidelines in `default-factory-skills.ts` to guide models to pre-split tasks in their own ReAct loop
- [x] 111.4 Compile, build, and verify server/client type safety

## Phase 112: Permission Engine & Sandboxing (Phase 1)
- [x] 112.1 Update CreateAgentSessionOptions in agent-session.ts to support beforeToolCall forwarding to Agent constructor
- [x] 112.2 Implement PermissionEngine stateless module under apps/server/src/core/sandbox/permission-engine.ts with default deny and ask rules
- [x] 112.3 Add sandbox barrel exports under apps/server/src/core/sandbox/index.ts
- [x] 112.4 Wire beforeToolCall hook in session-manager.ts to evaluate rules and pause-on-ask using uiApprovalRegistry and WebSocket broadcast
- [x] 112.5 Capture tool_approval_request WebSocket events in client ChatArea.tsx and map them as a custom message role
- [x] 112.6 Create interactive ToolApprovalCard in MessageList.tsx allowing inline Approve/Deny actions with auto-disable
- [x] 112.7 Verify successful compilation and build check for client and server






## Phase 113: Decompose SessionManager & Clean Up Passthroughs
- [x] 113.1 Create modular helper modules: workspace-resolver, tool-activation-engine, session-event-publisher, before-tool-call-hook, session-memory-enricher, agent-definition-resolver
- [x] 113.2 Refactor getOrCreateSession in session-manager.ts to delegate to new sub-modules
- [x] 113.3 Remove passthrough methods and expose public readonly sub-managers on SessionManager
- [x] 113.4 Migrate all 26+ callers of old delegate methods to use new properties directly
- [x] 113.5 Unify model resolution across channel-orchestrator.ts and judge.ts using resolveModelWithFallback
- [x] 113.6 Verify clean compilation and successful builds for both server and client packages

## Phase 114: Decompose ChannelOrchestrator
- [x] 114.1 Create deployment-context.ts shared utility and update prompt-builder.ts
- [x] 114.2 Create ChannelMessagePublisher factory and message-publisher.ts
- [x] 114.3 Create ResponseParser and response-parser.ts
- [x] 114.4 Create ChannelNegotiationHandler and channel-negotiation-handler.ts
- [x] 114.5 Create AgentPromptRunner and agent-prompt-runner.ts
- [x] 114.6 Refactor ChannelOrchestrator to thin coordinator delegating to new helper modules
- [x] 114.7 Resolve circular dependency between agent-registry.ts and channel-orchestrator.ts using callback registration
- [x] 114.8 Verify clean compilation and successful builds for both server and client packages

## Phase 115: Unify Lab-Channel Orchestration
- [x] 115.1 Add token collection utility `collectChannelTokens` under `core/agent-utils.ts`
- [x] 115.2 Create shared orchestration types under `channels/types.ts`
- [x] 115.3 Implement `runToCompletion` method in `ChannelOrchestrator` to automate setup, execution, and teardown
- [x] 115.4 Refactor `ExperimentRunner` to remove obsolete `runSingleVariant` and `runMultiVariant` duplicate methods and delegate to `channelOrchestrator.runToCompletion`
- [x] 115.5 Verify successful compilation and builds for both server and client packages

## Phase 116: Centralize Prompt Assembly
- [x] 116.1 Create `apps/server/src/core/prompts/prompt-assembly.ts` containing the centralized `assemblePromptAppends` factory and its modes
- [x] 116.2 Refactor `SessionPromptBuilder` to delegate to `assemblePromptAppends` in `standard-session` mode
- [x] 116.3 Refactor `AgentPromptRunner` to delegate to `assemblePromptAppends` in `channel-member` mode
- [x] 116.4 Fix `createAgentServer` prompt composition bug by delegating to `assemblePromptAppends` in `agent-startup` mode
- [x] 116.5 Refactor `spawn_subagent` tool to delegate to `assemblePromptAppends` in `subagent-spawn` mode and remove duplicate inline string structures
- [x] 116.6 Verify successful compilation, strict typecheck, and production builds of both client and server packages

## Phase 117: Extract useConnectionAwareEffect Hook
- [x] 117.1 Create useConnectionAware.ts custom React hook
- [x] 117.2 Refactor useWebSocket.ts to use the new hook
- [x] 117.3 Refactor useChannel.ts to use the new hook and split message/state connection effects
- [x] 117.4 Verify successful client build compilation
## Phase 118: Info/Edit Button for Projects & Agents
- [x] 118.1 Extend backend endpoints to return and patch project details (`cloneUrl`, `createdAt`, `diskPath`)
- [x] 118.2 Implement inline `ProjectInfoModal` details/editing panel on `DashboardPage` and add translations
- [x] 118.3 Add collapsible Advanced Configuration drawer with checkboxes for `serialTools` inside `RegisterModal` and add translations
- [x] 118.4 Move implemented plan to completed folder and verify client/server compilations

## Phase 119: Better Auth Integration & First-Run Onboarding
- [x] 119.1 Install better-auth and configure SQLite native database schema initialization dynamically in db.ts
- [x] 119.2 Implement username-based register and login flows with emailAndPassword authentication
- [x] 119.3 Implement /api/auth/status checking first-run and active sessions
- [x] 119.4 Rewrite AuthContext to support httpOnly cookie credentials and three-way loading state routing
- [x] 119.5 Create OnboardingPage welcome form for admin account registration
- [x] 119.6 Migrate all client fetch operations to apiFetch and eliminate localStorage raw JWT token dependency
- [x] 119.7 Replace server process.env.JWT_SECRET usages with persistent database-generated auth.options.secret
- [x] 119.8 Implement synchronous session token lookup and programmatic session token generation for subprocess environments in auth/onboarding.ts
- [x] 119.9 Verify 100% production compilation builds and clean typechecking of apps/server and apps/client

## Phase 120: Robust API Error Detection and Surfacing
- [x] 120.1 Implement `sanitizeUserErrorMessage` in `error-body.ts` to clean provider error message strings
- [x] 120.2 Handle empty message validations as errors in `openai-completions.ts` and `agent-loop.ts`
- [x] 120.3 Update `lazy.ts` to sanitize lazy setup error messages
- [x] 120.4 Update `agent-session.ts` catch blocks to persist throws, update context, and emit events
- [x] 120.5 Update client `ChatArea.tsx` and `MessageList.tsx` to handle, clear, and display custom API error cards
- [x] 120.6 Verify monorepo builds and compile targets cleanly

## Phase 121: Better Auth WS Debt Payoff (Professional Implementation)
- [x] 121.1 Remove manual CREATE TABLE from auth/db.ts, implement auth/migrate.ts with getMigrations/runMigrations and ensureAuthTables() on startup
- [x] 121.2 Refactor auth/onboarding.ts to use Better Auth plugin (programmaticSessionPlugin) via auth.api.createProgrammaticSession with fallback raw insert using randomUUID id, remove table ownership
- [x] 121.3 Refactor lib/auth-helpers.ts to single source of truth: extractToken without split('.'), SESSION_COOKIE_KEYS with __Secure- prefix, validateSessionFromHeaders via auth.api.getSession primary + sync DB fallback, shared parseExpiresAt/isExpired
- [x] 121.4 Create ws/registry.ts (no global counter, no mutation, explicit cleanup) and ws/factory.ts (closure-captured wsId via crypto.randomUUID(), structured logger, transactional auto-subscribe on prompt)
- [x] 121.5 Rewrite ws/handler.ts as compatibility shim + broadcast façade backed by registry, remove wsCounter/getWsIdFromContext loops and ws.wsId mutation
- [x] 121.6 Update index.ts WS route to use factory pattern (createWsContext with rawHeaders closure) and run ensureAuthTables() before serving
- [x] 121.7 Remove legacy token prop drilling from SettingsPage and 5 tab components, remove localStorage fallback from apiFetch and ws-client, verify grep 0
- [x] 121.8 Fix PreviewPanel to reuse wsClient singleton for preview_status/preview_build_log, remove separate new WebSocket()
- [x] 121.9 Implement robust offline queue (max 50, drop oldest with warning, isConnected guard) in ws-client.ts and dedup logic in useConnectionAwareEffect (dep-key + wasConnected tracking)
- [x] 121.10 Create ws/logger.ts structured logger, update about.md with WS cookie auth flow docs, add unit tests for auth-helpers and ws/factory (48 tests passing)
- [x] 121.11 Verify production builds (client + server) and all acceptance criteria

## Phase 122: Real-Time Session Visualization (Kanban, Sidebar Status, Org Chart)
- [x] 122.1 Create centralized `SessionsContext` + `useSessions` hook with WebSocket live status merging
- [x] 122.2 Add `/sessions` route to router and wire `SessionsProvider` in `AppRouter`
- [x] 122.3 Create `SessionsKanbanPage` with idle/working/done kanban columns
- [x] 122.4 Add session status dots to agents in `SessionSidebar` (like Slack)
- [x] 122.5 Add session status dots to channel members in `MembersPanel`
- [x] 122.6 Add session status indicators to `OrgFlowCanvas` and `OrgFlowMobile` node data
- [x] 122.7 Add "Session Board" navigation link in sidebar admin section
- [x] 122.8 Verify successful client compilation build

## Phase 123: Hackathon Submission Assets (Qwen Cloud — Track 3 Agent Society)
- [x] 123.1 Create gitignored assets/hackathon/ folder for screenshots and raw recordings
- [x] 123.2 Create README.md with track identification, feature overview, architecture summary, and quick start
- [x] 123.3 Create docs/architecture.md with Mermaid diagram showing Qwen Cloud → backend → frontend data flow
- [x] 123.4 Create alibaba-cloud/deployment-proof.md documenting DashScope API usage and OSS upload utility
- [x] 123.5 Create apps/server/src/alibaba-cloud/log-upload.ts OSS upload utility for benchmark reports
- [x] 123.6 Add ALIBABA_ACCESS_KEY_ID/SECRET and OSS_BUCKET/REGION env vars to .env.example and docker-compose.yml
- [x] 123.7 Create docs/demo-script.md with timestamped 3-minute walkthrough
- [x] 123.8 Create docs/blog-post.md draft for Medium/dev.to bonus prize
- [x] 123.9 Create plans/testing-hackathon.md with tiered test plan (negotiation, scoring, MCP, E2E)
- [ ] 123.10 Record demo video <3 min, upload to YouTube unlisted, add link to README
- [ ] 123.11 Deploy to Alibaba Cloud (ECS/Function Compute), add screenshots to deployment-proof.md
- [ ] 123.12 Implement tests per plans/testing-hackathon.md (31+ tests across negotiation, scoring, MCP, WS)
- [ ] 123.13 Publish blog post on Medium/dev.to, add link to Devpost submission
- [ ] 123.14 Submit on Devpost with all required fields and assets

## Phase 124: Layered Prompt System Audit Improvements
- [x] 124.1 Create `role-senior.ts` and `role-observer.ts` fragments with proper protocol and silent mode behavior
- [x] 124.2 Update `registry.ts` and `composer.ts` to map and load senior and observer prompt roles
- [x] 124.3 Implement single-leader enforcement on backend (POST/PATCH member endpoints returning 409 status code)
- [x] 124.4 Update frontend `AgentDetailPanel.tsx`, `AddMemberModal.tsx`, and `ChannelMembersModal.tsx` to disable/prevent multiple lead selection
- [x] 124.5 Inject agent-specific `selfReplyMode` and channel `leaderName` into DeploymentContext and substitute inside target/broadcast prompt fragments
- [x] 124.6 Enrich roster presentation showing member replyMode inside the composer logic
- [x] 124.7 Unify arbiter check prioritizing `negotiationProtocol.arbiterAgentId` configuration over default lead role
- [x] 124.8 Update unit tests inside `layered-prompt.test.ts` to cover new role prompt mappings and verify clean typecheck builds

## Phase 125: WebFetch Tool (Security & Performance)
- [x] 125.1 Implement core security layer (security.ts) blocking SSRF and DNS Rebinding
- [x] 125.2 Implement content extraction pipeline (extractor.ts) with readability, turndown, and regex fallback
- [x] 125.3 Implement caching layer with TTL and LRU eviction (cache.ts) and sliding window rate limiter (rate-limiter.ts)
- [x] 125.4 Define custom tool interface and execute pipeline (web-fetch-tool.ts) and register in SessionToolFactory
- [x] 125.5 Integrate web_fetch in AVAILABLE_TOOLS schema, tool activation engine, WS factory, and server routing permissions
- [x] 125.6 Build custom WebFetchResult React component and integrate in ToolsSelector and ToolCallRow
- [x] 125.7 Verify builds and SSRF protection layer successfully

## Phase 126: Channel Non-Streaming Render (Buffer Mode)
- [x] 126.1 Add streamingRenderMode field to shared schemas (Channel, CreateChannel, UpdateChannel)
- [x] 126.2 Persist streamingRenderMode field in the server-side channel-store
- [x] 126.3 Add streamingRenderMode dropdown selector to ChannelSettingsModal and support translations
- [x] 126.4 Update ChannelMessageList mapping logic to respect streamingRenderMode and conditionalize activeStreamList rendering
- [x] 126.5 Update ChannelMessages mapping logic and add typing indicator when streamingRenderMode is 'complete'
- [x] 126.6 Add typing indicator bar in ChannelChatArea above the ChatInput in complete mode
- [x] 126.7 Pass streamingRenderMode prop from ChannelDetailPage to ChannelMessages
- [x] 126.8 Verify clean compilation and successful builds of apps/server and apps/client

## Phase 127: Laboratory Efficiency Audit
- [x] 127.1 Normalise scoring formula by agent count and implement logarithmic ratio penalty
- [x] 127.2 Implement early-exit score parsing fast check and sliding window scans in DivergenceDetector
- [x] 127.3 Implement experiment-member prompt assembly mode and minimal LAB_APPEND_INSTRUCTIONS
- [x] 127.4 Add prompt caching and skip reload scans for laboratory channels
- [x] 127.5 Implement pre-LLM silent bypass check for observers and non-mentioned agents
- [x] 127.6 Add output-format prompt fragments (full-proposal, diff-suggestion, normal) as Capa 5
- [x] 127.7 Enforce diff suggestion formats using custom initial courtesy string stripper post-processors
- [x] 127.8 Integrate outputMode configuration option dropdown in AgentDetailPanel client view
- [x] 127.9 Verify clean compilation and successful workspace builds

## Phase 128: Fix Laboratory Multi-Agent Participation
- [x] 128.1 Remove pre-LLM silent bypass by mentions completely from `agent-prompt-runner.ts`
- [x] 128.2 Update leader role prompt fragment (`role-leader.ts`) to actively encourage delegation, task division, and consolidation
- [x] 128.3 Adjust member and senior role prompt fragments (`role-member.ts` and `role-senior.ts`) to permit active participation during proposal analysis instead of reverting to silent mode
- [x] 128.4 Verify successful backend test suite execution and workspace compilation

## Phase 129: Agent Edit Button in Chat Header
- [x] 129.1 Extract RegisterModal from AgentsPage.tsx to shared components/agents/RegisterModal.tsx
- [x] 129.2 Add config gear icon (Settings) in MainLayout right toolbar when activeAgent is set
- [x] 129.3 Wire RegisterModal with useAgents (updateAgent, uploadAvatar, deleteAvatar) for inline editing
- [x] 129.4 Verify client build compiles successfully

## Phase 130: Fix Cross-Session Memory Bleed
- [x] 130.1 Implement isSubstantiveMessage gate in agent-prompt-runner.ts
- [x] 130.2 Update historical memory context label in local-provider.ts
- [x] 130.3 Implement SQLite schema migration to add session_id column to memories table
- [x] 130.4 Extend RecallOptions and MemoryProvider interfaces in types.ts
- [x] 130.5 Update LocalMemoryProvider to support sessionId filters in store(), recall(), and buildContext()
- [x] 130.6 Update NullMemoryProvider to match interface modifications
- [x] 130.7 Pass sessionId from agent-prompt-runner.ts to buildContext and store
- [x] 130.8 Implement DELETE /api/channels/:id/memories endpoint on server
- [x] 130.9 Add Clear Memories button to ChannelMemoriesModal.tsx in client
- [x] 130.10 Add Reset Context button to ChannelChatArea.tsx in client
- [x] 130.11 Verify compilation, typecheck, and run tests

## Phase 131: WebSocket Technical Debt & Robustness
- [x] 131.1 Implement connection state "permanently_disconnected" and proactive client-side ping timeout checks in ws-client.ts (M6, M7)
- [x] 131.2 Add deduplication for message_start events inside ChatArea.tsx using message IDs and receivedMessageIds ref (M5)
- [x] 131.3 Implement hybrid pending prompt recovery using memory store and localStorage with 30s TTL in ChatArea.tsx (M9)
- [x] 131.4 Propagate ChatInput disabled state based on WebSocket connection status and disable WelcomeChatInput/ChatInput when offline (M8)
- [x] 131.5 Add connection state status indicators (colored dots) in DesktopHeader.tsx and MobileTopbar.tsx (M6)
- [x] 131.6 Verify compilation, typecheck, and monorepo build status

## Phase 132: Laboratory Sessions
- [x] 132.1 Filter out lab execution sessions starting with 'lab_run_' in session-lister.ts
- [x] 132.2 Implement router subpath support for '/laboratory/session/:sessionId' in useRouter.ts
- [x] 132.3 Integrate lab-architect agent in session-utils and useSessionActions for scoped design sessions
- [x] 132.4 Mount standard workspace session navigation toolbar inside MainLayout for general laboratory agent screen
- [x] 132.5 Accept sessionId inside LaboratoryPage component and handle dynamic resolve / redirect flows
- [x] 132.6 Update SessionsKanbanPage to route lab-architect sessions to laboratory design page
- [x] 132.7 Verify client/server compiles successfully and works robustly
