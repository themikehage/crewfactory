import { type CustomToolDefinition, CustomToolDefinitionSchema } from "./schemas";
import { customToolStorage } from "./storage";
import { createCustomToolRuntime } from "./runtime";
import { sessionManager } from "../session-manager";
import { ZodError } from "zod";

export interface ManageCustomToolsOptions {
  username: string;
  sessionId: string;
}

export function createManageCustomToolsTool(options: ManageCustomToolsOptions) {
  const { username, sessionId } = options;

  return {
    name: "manage_custom_tools",
    label: "Manage Custom Tools",
    description: "Allows the agent to get, upsert, delete, or toggle custom tools on demand.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["get", "upsert", "delete", "toggle"],
          description: "The action to perform",
        },
        tool: {
          type: "object",
          description: "The complete custom tool definition object (required for upsert)",
        },
        name: {
          type: "string",
          description: "The name of the tool (required for get, delete, or toggle)",
        },
        enabled: {
          type: "boolean",
          description: "The enabled status of the tool (required for toggle)",
        },
      },
      required: ["action"],
    },
    execute: async (toolCallId: string, params: any) => {
      const { action, tool, name, enabled } = params;

      try {
        switch (action) {
          case "get": {
            if (name) {
              const def = customToolStorage.get(username, name);
              if (!def) {
                return {
                  content: [{ type: "text", text: `Custom tool "${name}" not found.` }],
                  isError: true,
                };
              }
              return {
                content: [{ type: "text", text: JSON.stringify(def, null, 2) }],
                details: { tool: def },
              };
            } else {
              const all = customToolStorage.loadAll(username);
              return {
                content: [{ type: "text", text: `Loaded ${all.length} custom tools.` }],
                details: { tools: all },
              };
            }
          }

          case "upsert": {
            if (!tool) {
              return {
                content: [{ type: "text", text: "Parameter 'tool' is required for action 'upsert'." }],
                isError: true,
              };
            }

            let parsedTool: CustomToolDefinition;
            try {
              parsedTool = CustomToolDefinitionSchema.parse(tool);
            } catch (err) {
              if (err instanceof ZodError) {
                const issues = err.issues
                  .map(issue => `- Path [${issue.path.join(".")}]: ${issue.message}`)
                  .join("\n");
                return {
                  content: [{ type: "text", text: `Schema validation failed for custom tool:\n${issues}` }],
                  isError: true,
                };
              }
              throw err;
            }

            customToolStorage.upsert(username, parsedTool);

            // Dynamically register into the active session if available
            const session = sessionManager.getSession(username, sessionId);
            if (session) {
              const runtime = createCustomToolRuntime(parsedTool, {
                cwd: session.cwd,
                session,
                username,
                sessionId,
              });

              const filtered = (session.customTools || []).filter((t: any) => t.name !== parsedTool.name);
              const nextTools = parsedTool.enabled ? [...filtered, runtime] : filtered;
              session.customTools = nextTools;
              (session as any)._customTools = nextTools;

              if (typeof (session as any)._refreshToolRegistry === "function") {
                (session as any)._refreshToolRegistry();
              }
            }

            // Broadcast refresh
            try {
              const { broadcastToUser } = await import("../../ws/handler");
              broadcastToUser(username, {
                type: "entity-updated",
                entityType: "custom_tool",
              });
            } catch (e) {
              console.error("Failed to broadcast entity refresh:", e);
            }

            return {
              content: [{ type: "text", text: `Custom tool "${parsedTool.name}" successfully saved and updated in session.` }],
              details: { tool: parsedTool },
            };
          }

          case "delete": {
            if (!name) {
              return {
                content: [{ type: "text", text: "Parameter 'name' is required for action 'delete'." }],
                isError: true,
              };
            }

            customToolStorage.delete(username, name);

            // Dynamically remove from the active session
            const session = sessionManager.getSession(username, sessionId);
            if (session) {
              const nextTools = (session.customTools || []).filter((t: any) => t.name !== name);
              session.customTools = nextTools;
              (session as any)._customTools = nextTools;
              if (typeof (session as any)._refreshToolRegistry === "function") {
                (session as any)._refreshToolRegistry();
              }
            }

            // Broadcast refresh
            try {
              const { broadcastToUser } = await import("../../ws/handler");
              broadcastToUser(username, {
                type: "entity-updated",
                entityType: "custom_tool",
              });
            } catch (e) {
              console.error("Failed to broadcast entity refresh:", e);
            }

            return {
              content: [{ type: "text", text: `Custom tool "${name}" successfully deleted.` }],
              details: { deletedName: name },
            };
          }

          case "toggle": {
            if (!name || enabled === undefined) {
              return {
                content: [{ type: "text", text: "Parameters 'name' and 'enabled' are required for action 'toggle'." }],
                isError: true,
              };
            }

            customToolStorage.toggle(username, name, enabled);

            // Dynamically sync enabling/disabling in session
            const session = sessionManager.getSession(username, sessionId);
            if (session) {
              const def = customToolStorage.get(username, name);
              let nextTools = (session.customTools || []).filter((t: any) => t.name !== name);
              if (enabled && def) {
                const runtime = createCustomToolRuntime(def, {
                  cwd: session.cwd,
                  session,
                  username,
                  sessionId,
                });
                nextTools = [...nextTools, runtime];
              }
              session.customTools = nextTools;
              (session as any)._customTools = nextTools;
              if (typeof (session as any)._refreshToolRegistry === "function") {
                (session as any)._refreshToolRegistry();
              }
            }

            // Broadcast refresh
            try {
              const { broadcastToUser } = await import("../../ws/handler");
              broadcastToUser(username, {
                type: "entity-updated",
                entityType: "custom_tool",
              });
            } catch (e) {
              console.error("Failed to broadcast entity refresh:", e);
            }

            return {
              content: [{ type: "text", text: `Custom tool "${name}" enabled status set to ${enabled}.` }],
              details: { name, enabled },
            };
          }

          default:
            return {
              content: [{ type: "text", text: `Invalid action "${action}".` }],
              isError: true,
            };
        }
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error managing custom tools: ${err.message || err}` }],
          isError: true,
        };
      }
    },
  };
}
