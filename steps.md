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
