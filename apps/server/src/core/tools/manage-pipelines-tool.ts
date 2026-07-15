import { PipelineStore } from "../../pipelines/pipeline-store";
import { PipelineRunner } from "../../pipelines/pipeline-runner";
import type { FactoryToolOptions } from "./factory-tool";
import { broadcastToUser } from "../../ws/handler";

function ok(text: string, details?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    details: details ?? {},
  };
}

function err(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    isError: true,
  };
}

export function createManagePipelinesTool(opts: FactoryToolOptions) {
  const { username } = opts;

  return {
    name: "manage_pipelines",
    description: `Manage CrewFactory deterministic linear execution pipelines.
Allows listing pipelines, creating/updating definitions, running executions, aborting them, viewing logs/raw outputs, and reading/patching execution scripts.

Actions:
- get: List all pipelines, get a specific pipeline definition (and its scripts), list pipeline runs, or view a specific run summary.
- upsert: Create or update a pipeline definition. Can optionally include scripts inline.
- delete: Permanently remove a pipeline.
- run: Trigger a pipeline execution in the background (fire-and-forget). Returns a runId immediately.
- abort: Abort a running pipeline execution.
- get_run: Retrieve detailed execution status including raw outputs, stderr, and token usage for all stages of a specific run.
- read_script: Retrieve the script file content.
- patch_script: Update or write a single execution script.`,

    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["get", "upsert", "delete", "run", "abort", "get_run", "read_script", "patch_script"],
          description: "The action to perform on the pipelines.",
        },
        id: {
          type: "string",
          description: "The pipeline ID. Required for all actions except 'get' when listing all pipelines. For get runs/detail, format id as 'pipeline-id/runs' or 'pipeline-id/runs/run-id'.",
        },
        params: {
          type: "object",
          description: "Action-specific parameters: \n" +
            "- upsert: { name: string, description?: string, stages: PipelineStage[], scripts?: Record<string, string> }\n" +
            "- abort: { runId: string }\n" +
            "- get_run: { runId: string }\n" +
            "- read_script: { scriptName: string }\n" +
            "- patch_script: { scriptName: string, content: string }",
        },
      },
      required: ["action"],
    },

    execute: async (_toolCallId: string, args: any) => {
      const { action, id, params = {} } = args;

      try {
        if (action !== "get" && !id) {
          return err(`Pipeline ID (id) is required for action "${action}"`);
        }

        // Helper to notify the frontend UI of updates
        const notifyUI = () => {
          try {
            broadcastToUser(username, {
              type: "entity-updated",
              entityType: "pipeline",
            });
          } catch (e) {
            console.error("Failed to broadcast entity-updated event:", e);
          }
        };

        switch (action) {
          case "get": {
            if (!id) {
              const list = await PipelineStore.listPipelines(username);
              return ok(JSON.stringify({ pipelines: list }, null, 2), { pipelines: list });
            }

            const parts = id.split("/");
            const pipelineId = parts[0];

            // Sub-paths: "id/runs" or "id/runs/runId"
            if (parts[1] === "runs") {
              if (parts[2]) {
                const runId = parts[2];
                const run = await PipelineStore.getRun(username, pipelineId, runId);
                if (!run) return err(`Pipeline run "${runId}" not found for pipeline "${pipelineId}"`);
                return ok(JSON.stringify(run, null, 2), { run });
              }
              const runs = await PipelineStore.listRuns(username, pipelineId);
              return ok(JSON.stringify({ runs }, null, 2), { runs });
            }

            // Normal GET pipeline definition + script filenames
            const pipe = await PipelineStore.getPipeline(username, pipelineId);
            if (!pipe) return err(`Pipeline "${pipelineId}" not found`);

            const scriptFiles = await PipelineStore.listScripts(username, pipelineId);
            const scripts: Record<string, string> = {};
            for (const file of scriptFiles) {
              const content = await PipelineStore.getScript(username, pipelineId, file);
              if (content !== null) {
                scripts[file] = content;
              }
            }

            return ok(JSON.stringify({ pipeline: pipe, scripts }, null, 2), { pipeline: pipe, scripts });
          }

          case "upsert": {
            if (!params.name) return err("name is required in params for pipeline upsert");
            if (!params.stages || !Array.isArray(params.stages)) return err("stages array is required in params for pipeline upsert");

            const existing = await PipelineStore.getPipeline(username, id);
            let pipeline: any;
            if (existing) {
              pipeline = {
                ...existing,
                name: params.name,
                description: params.description ?? existing.description,
                stages: params.stages,
                updatedAt: new Date().toISOString(),
              };
            } else {
              pipeline = {
                id,
                name: params.name,
                description: params.description ?? "",
                version: 1,
                stages: params.stages,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
            }

            await PipelineStore.savePipeline(username, pipeline);

            if (params.scripts && typeof params.scripts === "object") {
              for (const [filename, content] of Object.entries(params.scripts)) {
                if (typeof content === "string") {
                  await PipelineStore.saveScript(username, id, filename, content);
                }
              }
            }

            notifyUI();
            return ok(`Pipeline "${id}" saved successfully`, { pipeline });
          }

          case "delete": {
            const existing = await PipelineStore.getPipeline(username, id);
            if (!existing) return err(`Pipeline "${id}" not found`);
            await PipelineStore.deletePipeline(username, id);
            notifyUI();
            return ok(`Pipeline "${id}" deleted successfully`);
          }

          case "run": {
            const existing = await PipelineStore.getPipeline(username, id);
            if (!existing) return err(`Pipeline "${id}" not found`);
            const runId = await PipelineRunner.run(username, id, "agent");
            notifyUI();
            return ok(`Pipeline "${id}" triggered in background. Run ID: ${runId}`, {
              pipelineId: id,
              runId,
              status: "started",
            });
          }

          case "abort": {
            const { runId } = params;
            if (!runId) return err("runId is required in params to abort a run");
            PipelineRunner.abortRun(username, runId);
            notifyUI();
            return ok(`Pipeline run "${runId}" abort request sent`);
          }

          case "get_run": {
            const { runId } = params;
            if (!runId) return err("runId is required in params to get detailed run info");
            const run = await PipelineStore.getRun(username, id, runId);
            if (!run) return err(`Pipeline run "${runId}" not found for pipeline "${id}"`);
            return ok(JSON.stringify(run, null, 2), { run });
          }

          case "read_script": {
            const { scriptName } = params;
            if (!scriptName) return err("scriptName is required in params to read a script");
            const content = await PipelineStore.getScript(username, id, scriptName);
            if (content === null) return err(`Script "${scriptName}" not found in pipeline "${id}"`);
            return ok(content, { scriptName, content });
          }

          case "patch_script": {
            const { scriptName, content } = params;
            if (!scriptName) return err("scriptName is required in params to patch a script");
            if (typeof content !== "string") return err("content (string) is required in params to patch a script");
            await PipelineStore.saveScript(username, id, scriptName, content);
            notifyUI();
            return ok(`Script "${scriptName}" updated successfully in pipeline "${id}"`);
          }

          default:
            return err(`Unknown action: ${action}`);
        }
      } catch (e: any) {
        return err(`Error executing pipelines action "${action}": ${e.message || String(e)}`);
      }
    },
  };
}
