# Pi CLI vs CrewFactory - Gap Analysis Report

This report analyzes the functional gaps between the native **Pi CLI** and the **CrewFactory** web application, prioritizing the features that would bring the web UI closer to the terminal experience.

---

## 1. Feature Comparison Matrix

| Feature | Pi CLI Capability | Web Wrapper Current State | Gap / Implementation Path |
| :--- | :--- | :--- | :--- |
| **Session Branching** | Native tree routing (`/tree` TUI selector, branching message nodes). | **Implemented** (Paginated bubble versions with `< 1 / 2 >` controls). | None. Feature successfully implemented in client and Hono routes. |
| **Context Compaction** | Automatic on threshold and manual via `/compact`. | Backend auto-compacts, but no UI controls or context window usage indicators. | **Missing.** Add a context window usage progress bar in the chat footer and a manual "Compact Context" button. |
| **Message Queueing** | Enqueueing steering messages (Enter) and follow-ups (Alt+Enter) during streaming. | Input area is disabled or ignored during active generation. | **Missing.** Keep the text input enabled during streaming. Route submissions to WebSocket events `steer` and `follow_up` (backend already supports these). |
| **Tool Customization** | Command line flags `--tools`, `--exclude-tools`, and `--no-builtin-tools`. | Server initializes the SDK session with default tools. No user control. | **Missing.** Implement a "Session Settings" panel where users can toggle tools (e.g., disable `bash` for safety, or run in Read-Only mode). |
| **Local Shell Commands** | Direct execution via `!command` (send output to LLM) and `!!command` (run locally). | No direct command execution capability for the user in the UI. | **Missing.** Intercept prompts starting with `!` in the input, run them on the host, and render command console blocks in the chat feed. |
| **Prompts & Skills** | Auto-discovery and expansion of prompt templates (`/name`) and Skills. | Supported by SDK under the hood, but no discovery or management UI. | **Missing.** Add a "Library" sidebar containing local project skills (from `.agents/skills`) and custom templates for quick copy/expansion. |
| **Exporting & Sharing** | `/export` (HTML/JSONL output) and `/share` (secret GitHub Gist export). | No exporting capabilities from the web UI. | **Missing.** Add a "Download Session" action (HTML / JSONL) and a "Share to Gist" action using GitHub integration. |

---

## 2. Priority Backlog for the Web Wrapper

### Priority 1: Message Queueing (Steering & Follow-ups)
*   **Why:** Enables the user to correct or steer the agent without waiting for complex tool runs to finish, representing a critical productivity feature in the CLI.
*   **How:** Keep the chat input active during streaming. If `streaming === true`, enter key sends a WebSocket event `{ type: "steer", message }`, and Alt+Enter (or a dropdown selector) sends `{ type: "follow_up", message }`.

### Priority 2: Agent Tools Selector & Sandboxing
*   **Why:** Secures host execution and customizes agent capabilities. Users should be able to restrict the agent to "Read-Only" mode (disabling `write`, `edit`, `bash`) before running a review.
*   **How:** Expose checkboxes in the sidebar or model selector dropdown to let users choose allowed tools. Call `session.setActiveToolsByName()` in the backend before starting a run.

### Priority 3: Context Usage Meter & Manual Compaction
*   **Why:** Provides transparency regarding the model's token consumption and cost before auto-compaction is triggered.
*   **How:** Utilize the existing token stats returned by `/api/sessions/:id/messages` to draw a progress bar (e.g., `85% of 200k context`). Add a button to manually invoke the backend's `/api/sessions/:id/compact` endpoint.

### Priority 4: Quick Prompt Templates & Skills Explorer
*   **Why:** Saves developers time by letting them load predefined templates directly in the web editor.
*   **How:** Fetch local skills and prompts in the backend, expose them via a `/api/resources` endpoint, and build an overlay in the frontend to search and inject them into the text area.

optimizar y lo del benchmark,


AdAdAdAdemásemásemásemás de de de de lo lo lo lo que que que que ya ya ya ya te te te te cont cont cont contéééé,,,, también también también también pued pued pued puedoooo:

:

:

:

******DDDDatosatosatosatos y y y y análisis análisis análisis análisis ** ** ** ---- Le Le Le Leerererer,,,, proces proces proces procesarararar y y y y transform transform transform transformarararar arch arch arch archivosivosivosivos ( ( ( (JSONJSONJSONJSON,,,, CSV CSV CSV CSV,,,, logs logs logs logs,,,, lo lo lo lo que que que que sea sea sea sea). ). ). ). ---- H H H Haceraceraceracer análisis análisis análisis análisis explor explor explor exploratorioatorioatorioatorio con con con con Python Python Python Python inline inline inline inline.

.

.

.

******ArchArchArchArchivosivosivosivos y y y y proyecto proyecto proyecto proyecto ** ** ** ---- Cre Cre Cre Crearararar estruct estruct estruct estructurasurasurasuras complet complet complet completasasasas de de de de proyecto proyecto proyecto proyecto ( ( ( (ccccarparparparpetasetasetasetas,,,, config config config configssss,,,, depend depend depend dependenciasenciasenciasencias). ). ). ). ---- Bus Bus Bus Bus

