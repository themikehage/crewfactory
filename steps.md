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
