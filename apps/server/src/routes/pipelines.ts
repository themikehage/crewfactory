import { Hono } from "hono";
import { authMiddleware, getAuthPayload } from "../middleware/auth";
import { PipelineStore } from "../pipelines/pipeline-store";
import { PipelineRunner } from "../pipelines/pipeline-runner";
import { PipelineDefinitionSchema } from "shared";
import { z } from "zod";

export const pipelinesRouter = new Hono();

pipelinesRouter.use("/*", authMiddleware);

// Get all pipelines
pipelinesRouter.get("/", async (c) => {
  const { username } = getAuthPayload(c);
  try {
    const list = await PipelineStore.listPipelines(username);
    return c.json({ pipelines: list });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// Get pipeline definition
pipelinesRouter.get("/:id", async (c) => {
  const { username } = getAuthPayload(c);
  const id = c.req.param("id");
  try {
    const pipe = await PipelineStore.getPipeline(username, id);
    if (!pipe) return c.json({ error: `Pipeline "${id}" not found` }, 404);
    
    // Also load scripts for display
    const scripts: Record<string, string> = {};
    try {
      const scriptFiles = await PipelineStore.listScripts(username, id);
      for (const file of scriptFiles) {
        const content = await PipelineStore.getScript(username, id, file);
        if (content !== null) {
          scripts[file] = content;
        }
      }
    } catch (e) {
      console.warn(`Failed to read scripts for pipeline ${id}:`, e);
    }

    return c.json({ pipeline: pipe, scripts });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// Create/Update pipeline
pipelinesRouter.post("/", async (c) => {
  const { username } = getAuthPayload(c);
  try {
    const body = await c.req.json();
    
    // Validate schema
    const parsed = PipelineDefinitionSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid pipeline definition", details: parsed.error.format() }, 400);
    }

    const pipeline = parsed.data;
    pipeline.createdAt = pipeline.createdAt || new Date().toISOString();
    pipeline.updatedAt = new Date().toISOString();

    await PipelineStore.savePipeline(username, pipeline);

    // Save scripts if provided
    if (body.scripts && typeof body.scripts === "object") {
      for (const [filename, content] of Object.entries(body.scripts)) {
        if (typeof content === "string") {
          await PipelineStore.saveScript(username, pipeline.id, filename, content);
        }
      }
    }

    return c.json({ success: true, pipeline });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// Delete pipeline
pipelinesRouter.delete("/:id", async (c) => {
  const { username } = getAuthPayload(c);
  const id = c.req.param("id");
  try {
    const existing = await PipelineStore.getPipeline(username, id);
    if (!existing) return c.json({ error: `Pipeline "${id}" not found` }, 404);

    await PipelineStore.deletePipeline(username, id);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// Run a pipeline
pipelinesRouter.post("/:id/run", async (c) => {
  const { username } = getAuthPayload(c);
  const id = c.req.param("id");
  try {
    const runId = await PipelineRunner.run(username, id, "manual");
    return c.json({ success: true, runId });
  } catch (error: any) {
    return c.json({ error: error.message || String(error) }, 500);
  }
});

// List pipeline runs
pipelinesRouter.get("/:id/runs", async (c) => {
  const { username } = getAuthPayload(c);
  const id = c.req.param("id");
  try {
    const runs = await PipelineStore.listRuns(username, id);
    return c.json({ runs });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// Get pipeline run details
pipelinesRouter.get("/:id/runs/:runId", async (c) => {
  const { username } = getAuthPayload(c);
  const id = c.req.param("id");
  const runId = c.req.param("runId");
  try {
    const run = await PipelineStore.getRun(username, id, runId);
    if (!run) return c.json({ error: `Run "${runId}" not found for pipeline "${id}"` }, 404);
    return c.json({ run });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});

// Abort a pipeline run
pipelinesRouter.post("/:id/runs/:runId/abort", async (c) => {
  const { username } = getAuthPayload(c);
  const id = c.req.param("id");
  const runId = c.req.param("runId");
  try {
    PipelineRunner.abortRun(username, runId);
    return c.json({ success: true });
  } catch (error) {
    return c.json({ error: String(error) }, 500);
  }
});
