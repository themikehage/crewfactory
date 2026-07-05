import { join, isAbsolute } from "path";
import { writeFileSync } from "fs";
import { uiApprovalRegistry } from "./ui-approval-registry";

export function createUiTools(workspaceDir: string) {
  const requestApprovalTool = {
    name: "request_approval",
    description: "Request user confirmation or approval before executing a dangerous, critical, or destructive action.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short descriptive title of the action requiring approval." },
        description: { type: "string", description: "Explanation of why this action needs to be approved." },
        severity: { type: "string", enum: ["info", "warning", "critical"], default: "warning" },
        confirmLabel: { type: "string", description: "Custom text for the confirm button." },
        cancelLabel: { type: "string", description: "Custom text for the cancel button." },
        details: { type: "string", description: "Optional markdown content with technical details, code differences, or commands to be executed." }
      },
      required: ["title", "description"]
    },
    execute: async (toolCallId: string, args: any) => {
      const result = await uiApprovalRegistry.register(toolCallId);
      const textResult = result.action === "confirm" ? "confirmed" : "cancelled";
      return {
        content: [{ type: "text", text: textResult }],
        details: { status: textResult }
      };
    }
  };

  const proposeCodeChangeTool = {
    name: "propose_code_change",
    description: "Propose modifications or creations of files to the user with a visual diff before applying them.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "The relative or absolute path of the file to modify or create." },
        description: { type: "string", description: "Explanation of what changes are being proposed." },
        originalContent: { type: "string", description: "The current content of the file. Leave empty if creating a new file." },
        proposedContent: { type: "string", description: "The proposed content of the file." }
      },
      required: ["path", "proposedContent"]
    },
    execute: async (toolCallId: string, args: any) => {
      const result = await uiApprovalRegistry.register(toolCallId);
      if (result.action === "confirm") {
        const fileTarget = isAbsolute(args.path) ? args.path : join(workspaceDir, args.path);
        try {
          writeFileSync(fileTarget, args.proposedContent, "utf-8");
          return {
            content: [{ type: "text", text: "applied" }],
            details: { status: "applied", path: args.path }
          };
        } catch (err: any) {
          return {
            content: [{ type: "text", text: `failed_to_apply: ${err.message}` }],
            details: { status: "error", error: err.message }
          };
        }
      }
      return {
        content: [{ type: "text", text: "discarded" }],
        details: { status: "discarded" }
      };
    }
  };

  const renderMediaCardTool = {
    name: "render_media_card",
    description: "Render a premium media card in the chat to present generated images, mockups, or UI visuals to the user.",
    parameters: {
      type: "object",
      properties: {
        mediaPath: { type: "string", description: "The path or URL of the generated image/asset." },
        title: { type: "string", description: "Title of the card/asset." },
        prompt: { type: "string", description: "The prompt used to generate the image." },
        aspectRatio: { type: "string", description: "Optional aspect ratio (e.g. '16:9', '1:1', '4:3')." }
      },
      required: ["mediaPath", "title"]
    },
    execute: async (toolCallId: string, args: any) => {
      return {
        content: [{ type: "text", text: `Media "${args.title}" rendered.` }],
        details: { status: "rendered" }
      };
    }
  };

  const requestFormInputTool = {
    name: "request_form_input",
    description: "Request the user to fill out a structured form (e.g., configurations, keys, or credentials) dynamically in the chat.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Title of the input request card." },
        description: { type: "string", description: "Brief instructions of what the form is for." },
        fields: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Unique programmatic key of the input field." },
              label: { type: "string", description: "User-facing label for the input." },
              type: { type: "string", enum: ["text", "password", "number", "select"], default: "text" },
              required: { type: "boolean", default: true },
              options: { type: "array", items: { type: "string" }, description: "Required if type is select." }
            },
            required: ["name", "label"]
          }
        }
      },
      required: ["title", "fields"]
    },
    execute: async (toolCallId: string, args: any) => {
      const result = await uiApprovalRegistry.register(toolCallId);
      if (result.action === "submit") {
        return {
          content: [{ type: "text", text: "submitted" }],
          details: { status: "submitted", payload: result.payload }
        };
      }
      return {
        content: [{ type: "text", text: "cancelled" }],
        details: { status: "cancelled" }
      };
    }
  };

  const configureAgentCardTool = {
    name: "configure_agent_card",
    description: "Display an interactive panel to let the user review and override settings for a specific agent.",
    parameters: {
      type: "object",
      properties: {
        targetAgentId: { type: "string", description: "The unique ID of the agent to configure." }
      },
      required: ["targetAgentId"]
    },
    execute: async (toolCallId: string, args: any) => {
      const result = await uiApprovalRegistry.register(toolCallId);
      if (result.action === "confirm" && result.payload) {
        return {
          content: [{ type: "text", text: "configured" }],
          details: { status: "configured", settings: result.payload }
        };
      }
      return {
        content: [{ type: "text", text: "cancelled" }],
        details: { status: "cancelled" }
      };
    }
  };

  const renderChartTool = {
    name: "render_chart",
    description: "Render an interactive chart (bar, line, pie, or area) inside the chat stream to display analytical data.",
    parameters: {
      type: "object",
      properties: {
        chartType: { type: "string", enum: ["bar", "line", "pie", "area"], description: "Type of chart to display." },
        title: { type: "string", description: "Title of the chart." },
        data: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true
          },
          description: "Data rows. E.g., [{ label: 'Jan', value: 100 }]"
        },
        config: {
          type: "object",
          properties: {
            stacked: { type: "boolean", description: "If true, stack values on top of each other." },
            colors: { type: "array", items: { type: "string" }, description: "Array of color keys/hex codes for variables." },
            xLabel: { type: "string", description: "Label for the X-axis." },
            yLabel: { type: "string", description: "Label for the Y-axis." }
          }
        }
      },
      required: ["chartType", "data"]
    },
    execute: async (toolCallId: string, args: any) => {
      return {
        content: [{ type: "text", text: `Chart "${args.title || args.chartType}" rendered successfully.` }],
        details: { status: "rendered" }
      };
    }
  };

  return [
    requestApprovalTool,
    proposeCodeChangeTool,
    renderMediaCardTool,
    requestFormInputTool,
    configureAgentCardTool,
    renderChartTool
  ];
}
