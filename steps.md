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

## Phase 93: Plan (Audit Slow Operations)
- [x] 93.1 Created `plans/audit-slow-operations.md` — Performance audit of decompose tasks, LLM judge, and export experiment
