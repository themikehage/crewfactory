COMPLETED ✅ 
# Plan: share_file Tool

## Goal
Add an official `share_file` tool so the agent can share downloadable artifacts (PDF, DOC, XLSX, PPTX, ZIP, etc.) directly in the chat stream. The user sees a download card and clicks to download.

## How It Works
1. Agent generates a file (e.g. `report.pdf`) in the workspace
2. Agent calls `share_file` with the file path and optional title
3. The UI renders a download card with file name, size, and a download button
4. User clicks download -> browser fetches via existing `/api/workspace/*` endpoint with `?download=1`

## Registration Points (11 places)

### Server-side

| # | File | What | Lines |
|---|------|------|-------|
| 1 | `apps/server/src/core/ui-tools.ts` | Define `shareFileTool` object (name, description, parameters, execute) and add to return array | ~164 |
| 2 | `apps/server/src/core/session-manager.ts` | Add instruction in `appendSystemPrompt` AG-UI Protocol section | ~338 |
| 3 | `apps/server/src/agents/create-agent-server.ts` | Add instruction in `appendSystemPrompt` array | ~68 |
| 4 | `apps/server/src/agents/create-agent-server.ts` | Add `"share_file"` to `setActiveToolsByName` default list | ~101-108 |
| 5 | `apps/server/src/ws/handler.ts` | Add `"share_file"` to tool preservation list (WebSocket prompt path) | ~307-309 |
| 6 | `apps/server/src/routes/sessions.ts` | Add `"share_file"` to tool preservation list (REST PUT tools path) | ~608-610 |
| 7 | `packages/shared/src/schemas.ts` | Add `"share_file"` to `AVAILABLE_TOOLS` const array | ~39-42 |

### Client-side

| # | File | What |
|---|------|------|
| 8 | `apps/client/src/components/chat/ToolsSelector.tsx` | Add entry to `ALL_TOOLS` array |
| 9 | `apps/client/src/components/chat/tools/ToolCallRow.tsx` | Add `case "share_file"` in `ToolBody` switch + `getResultSummary` switch |
| 10 | `apps/client/src/components/chat/tools/ShareFileCard.tsx` | **New component** - download card UI |
| 11 | `apps/client/src/components/chat/tools/ToolCallRow.tsx` | Import and render `ShareFileCard` in the share_file case |

### No changes needed (already supports file serving)
- `apps/server/src/routes/files.ts` - Already has `?download=1` query param support on both `/api/sessions/:id/files/*` and `/api/workspace/*` endpoints

## Tool Schema

```typescript
{
  name: "share_file",
  description: "Share a generated file (PDF, DOC, XLSX, PPTX, ZIP, images, etc.) with the user for download. Use this when you produce any artifact the user should be able to download.",
  parameters: {
    type: "object",
    properties: {
      filePath: {
        type: "string",
        description: "The workspace-relative path to the file to share (e.g. 'assets/report.pdf')."
      },
      title: {
        type: "string",
        description: "Optional display title for the download card. Defaults to the file name."
      }
    },
    required: ["filePath"]
  }
}
```

## Execute behavior
The execute function simply returns a success message. The real work is done by the client-side component which renders the download card and constructs the download URL.

```typescript
execute: async (toolCallId, args) => {
  const fileName = args.filePath.split(/[\\/]/).pop() || args.filePath;
  return {
    content: [{ type: "text", text: `File "${fileName}" shared for download.` }],
    details: { status: "shared", filePath: args.filePath }
  };
}
```

## Client Component (ShareFileCard.tsx)

Renders a card with:
- File icon (based on extension: pdf, doc, xls, zip, etc.)
- File name / title
- File size (fetched or displayed after load)
- Download button that triggers `window.open()` or `<a download>` using the existing workspace file endpoint

Download URL pattern (reuse `resolveImageUrl` logic from ImageGrid):
```
/api/workspace/{filePath}?repo=X&agentId=Y&channelId=Z&download=1
```

## System Prompt Instruction

```
- share_file: When you generate any file artifact that the user should download (PDF reports, Excel spreadsheets, PowerPoint presentations, Word documents, ZIP archives, etc.), use this tool to share it directly in the chat. The user will see a download card and can click to download. Always prefer this over telling the user to manually find the file in the workspace.
```

## Implementation Order

1. `packages/shared/src/schemas.ts` - Add to AVAILABLE_TOOLS
2. `apps/server/src/core/ui-tools.ts` - Define the tool
3. `apps/server/src/core/session-manager.ts` - Add system prompt instruction
4. `apps/server/src/agents/create-agent-server.ts` - Add system prompt + default tools list
5. `apps/server/src/ws/handler.ts` - Add to WS tool preservation
6. `apps/server/src/routes/sessions.ts` - Add to REST tool preservation
7. `apps/client/src/components/chat/tools/ShareFileCard.tsx` - Create download card component
8. `apps/client/src/components/chat/tools/ToolCallRow.tsx` - Add rendering case
9. `apps/client/src/components/chat/ToolsSelector.tsx` - Add to ALL_TOOLS
