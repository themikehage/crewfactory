import { uiApprovalRegistry } from "./ui-approval-registry";

export const requestApprovalTool = {
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
    // Suspend the execution promise until user confirmation is received
    const result = await uiApprovalRegistry.register(toolCallId);
    const textResult = result === "confirm" ? "confirmed" : "cancelled";
    return {
      content: [{ type: "text", text: textResult }],
      details: { status: textResult }
    };
  }
};

export const renderChartTool = {
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
    // Charts are read-only and render immediately on the client using call arguments.
    // The execution finishes immediately with a success message.
    return {
      content: [{ type: "text", text: `Chart "${args.title || args.chartType}" rendered successfully.` }],
      details: { status: "rendered" }
    };
  }
};

export const uiTools = [requestApprovalTool, renderChartTool];
