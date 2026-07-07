import { uiApprovalRegistry } from "./ui-approval-registry";

export function createUiTools(
  workspaceDir: string,
  username: string,
  isLaboratory?: boolean,
  subagentOptions?: any
) {
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
      if (isLaboratory) {
        return {
          content: [{ type: "text", text: "confirmed" }],
          details: { status: "confirmed", autoApproved: true }
        };
      }
      const result = await uiApprovalRegistry.register(toolCallId);
      const textResult = result.action === "confirm" ? "confirmed" : "cancelled";
      return {
        content: [{ type: "text", text: textResult }],
        details: { status: textResult }
      };
    }
  };

  const askQuestionTool = {
    name: "ask_question",
    description: "Ask the user a multiple-choice question, allowing single or multi-selection, and/or a custom text write-in response.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "The main question to ask the user." },
        isMultiSelect: { type: "boolean", description: "If true, the user can select multiple options using checkboxes. Defaults to false." },
        options: {
          type: "array",
          items: { type: "string" },
          description: "List of predefined options for the user. Must have at least 2 options."
        },
        placeholder: { type: "string", description: "Optional placeholder text for the custom/write-in input field." },
        allowCustom: { type: "boolean", description: "If true, show a custom text area for the user to write their own answer. Defaults to true.", default: true }
      },
      required: ["question", "options"]
    },
    execute: async (toolCallId: string, args: any) => {
      if (isLaboratory) {
        const firstOption = args.options?.[0] || "Default Option";
        return {
          content: [{ type: "text", text: `Selected: ${firstOption} (Auto-selected in Lab)` }],
          details: { status: "submitted", payload: { selectedOptions: [firstOption] }, autoApproved: true }
        };
      }
      const result = await uiApprovalRegistry.register(toolCallId);
      if (result.action === "submit" && result.payload) {
        const selectedStr = result.payload.selectedOptions?.join(", ") || "";
        const customStr = result.payload.customAnswer || "";
        let summary = "";
        if (selectedStr) summary += `Selected: ${selectedStr}`;
        if (customStr) summary += (summary ? " | " : "") + `Custom answer: ${customStr}`;
        return {
          content: [{ type: "text", text: summary || "Answer submitted" }],
          details: { status: "submitted", payload: result.payload }
        };
      }
      return {
        content: [{ type: "text", text: "cancelled" }],
        details: { status: "cancelled" }
      };
    }
  };

  const renderImagesTool = {
    name: "render_images",
    description: "Render a grid of images/drawings inside the chat stream using local paths, URLs, or base64 data.",
    parameters: {
      type: "object",
      properties: {
        images: {
          type: "array",
          description: "Array of images to display.",
          items: {
            type: "object",
            properties: {
              url: { type: "string", description: "The local workspace path, base64 data, or web URL of the image." },
              title: { type: "string", description: "Optional title or caption for the image." }
            },
            required: ["url"]
          }
        }
      },
      required: ["images"]
    },
    execute: async (toolCallId: string, args: any) => {
      return {
        content: [{ type: "text", text: `Rendered ${args.images?.length || 0} images.` }],
        details: { status: "rendered" }
      };
    }
  };

  const renderHtmlTool = {
    name: "render_html",
    description: "Render an HTML document inside the chat stream for live preview. Use for web pages, mockups, dashboards, or any HTML output the user should see rendered.",
    parameters: {
      type: "object",
      properties: {
        html: { type: "string", description: "Full HTML document content starting with <!DOCTYPE html> or <html>." },
        title: { type: "string", description: "Optional title for the HTML document preview card." }
      },
      required: ["html"]
    },
    execute: async (toolCallId: string, args: any) => {
      return {
        content: [{ type: "text", text: `HTML document "${args.title || "output"}" rendered successfully.` }],
        details: { status: "rendered" }
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

  const shareFileTool = {
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
    },
    execute: async (toolCallId: string, args: any) => {
      const { existsSync } = await import("node:fs");
      const { join } = await import("node:path");
      
      let cleanPath = args.filePath;
      if (cleanPath.startsWith("workspace/")) {
        cleanPath = cleanPath.substring("workspace/".length);
      }
      
      const fullPath = join(workspaceDir, cleanPath);
      
      if (!existsSync(fullPath)) {
        return {
          content: [{ type: "text", text: `Error: File not found at "${args.filePath}". Make sure you created the file first using write or bash tools.` }],
          isError: true
        };
      }
      
      const fileName = args.filePath.split(/[\\/]/).pop() || args.filePath;
      return {
        content: [{ type: "text", text: `File "${fileName}" shared for download.` }],
        details: { status: "shared", filePath: cleanPath }
      };
    }
  };

  const refreshUiTool = {
    name: "refresh_ui",
    description: "Notify the frontend interface to refresh a specific section or all sidebar lists (projects/repositories, agents, channels, experiments, custom skills) after making mutations.",
    parameters: {
      type: "object",
      properties: {
        entityType: {
          type: "string",
          enum: ["project", "agent", "channel", "experiment", "skill", "all"],
          description: "The type of entity to refresh in the user interface. Use 'all' if multiple types changed."
        }
      },
      required: ["entityType"]
    },
    execute: async (toolCallId: string, args: any) => {
      const { broadcastToUser } = await import("../ws/handler");
      broadcastToUser(username, {
        type: "entity-updated",
        entityType: args.entityType || "all",
      });
      return {
        content: [{ type: "text", text: `Triggered UI refresh for: ${args.entityType}` }],
        details: { status: "refreshed", entityType: args.entityType }
      };
    }
  };

  const tools = [
    requestApprovalTool,
    askQuestionTool,
    renderImagesTool,
    renderHtmlTool,
    renderChartTool,
    shareFileTool,
    refreshUiTool
  ];

  if (subagentOptions) {
    const { createSpawnSubagentTool } = require("./spawn-subagent-tool");
    tools.push(createSpawnSubagentTool(subagentOptions));
    const { createDelegateTaskTool } = require("./delegate-tool");
    tools.push(createDelegateTaskTool(subagentOptions));
  }

  return tools;
}
