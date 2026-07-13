export const CUSTOM_TOOL_INSTRUCTIONS = `
## Custom Tool Builder

You have access to a \`manage_custom_tools\` tool that lets you create, update, delete, and manage custom tools on demand. 

### When to Create a Custom Tool
1. You need to execute a multi-step workflow repeatedly (pipeline mode).
2. You want to display structured data to the user as cards, tables, metrics, etc. (UI mode).
3. The task requires combining several existing tools into a single reusable operation.

### Tool Definition Contract
The tool accepts the following JSON structure:
{
  "name": "snake_case_name",        // Required: unique lowercase letters/numbers/underscores
  "label": "Human Readable Name",   // Optional: UI display name
  "description": "Detailed description of what this tool does, when to use it, and what it returns.", // Required (10-500 chars)
  "parameters": {                   // Required: JSON Schema for inputs
    "type": "object",
    "properties": { ... },
    "required": [...]
  },
  "execute": { ... },              // Required: how the tool runs (see below)
  "ui": { ... },                   // Optional: how results look in the UI (see Tiers)
  "presentation": {                // Optional: UI presentation preferences
    "defaultExpanded": true,       // Whether the tool result is expanded by default in chat (default: true)
    "accordionDefaultOpen": true   // Default open state for accordion items when not specified per item (default: true)
  }
}

### Execution Modes
1. **Pipeline (type: "pipeline")**: Runs existing tools (bash, read, write, edit, grep, find, ls) sequentially. Resolve parameters via \`{varName}\` from inputs or prior step outputs.
   Example:
   {
     "type": "pipeline",
     "onError": "stop",
     "steps": [
       { "tool": "bash", "params": { "command": "find {path} -name '*.ts' | wc -l" }, "output": "fileCount", "description": "Count files" }
     ]
   }
2. **UI (type: "ui")**: Pure visual rendering tool. No server-side execution. The \`ui\` block defines what the user sees.

### UI Components Tiers
- **Tier 1 — Base**:
  - **card**: \`{ "type": "card", "title": "...", "description": "...", "status": "success|warning|error|info", "metadata": {} }\`
  - **card-list**: \`{ "type": "card-list", "title": "...", "cards": [...], "columns": 2 }\`
  - **table**: \`{ "type": "table", "title": "...", "columns": ["Header1"], "rows": [{"Header1": "val"}], "striped": true }\`
  - **badge**: \`{ "type": "badge", "text": "...", "variant": "success|warning|error|info|neutral" }\`
  - **metric**: \`{ "type": "metric", "label": "...", "value": "...", "trend": "up|down|neutral" }\`
  - **code**: \`{ "type": "code", "code": "...", "language": "ts", "title": "..." }\`
  - **section**: \`{ "type": "section", "title": "...", "children": [...] }\`
  - **html**: \`{ "type": "html", "html": "...", "title": "...", "height": "70vh" }\`
- **Tier 2 — Media**:
  - **video**: \`{ "type": "video", "src": "...", "title": "..." }\`
  - **audio**: \`{ "type": "audio", "src": "...", "title": "..." }\`
  - **pdf**: \`{ "type": "pdf", "src": "...", "title": "..." }\`
- **Tier 3 — High-Demand**:
  - **tabs**: \`{ "type": "tabs", "tabs": [{ "label": "Tab1", "content": [...] }] }\`
  - **markdown**: \`{ "type": "markdown", "content": "# MD content" }\`
  - **progress**: \`{ "type": "progress", "value": 75, "label": "Progress" }\`
  - **accordion**: \`{ "type": "accordion", "items": [{ "title": "Sec", "content": [...], "defaultOpen": true }] }\` // defaultOpen per item, defaults to true (uses presentation.accordionDefaultOpen if omitted)
  - **diff**: \`{ "type": "diff", "oldCode": "...", "newCode": "..." }\`
  - **steps**: \`{ "type": "steps", "steps": [{ "label": "Build", "status": "done" }] }\`
  - **stats**: \`{ "type": "stats", "stats": [{ "label": "...", "value": "..." }] }\`
  - **timeline**: \`{ "type": "timeline", "items": [{ "title": "Event", "date": "2026-01" }] }\`

Use UI components nested if needed (e.g. badge inside section, list of cards inside accordion).
`;
