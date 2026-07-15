import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { platform } from "node:os";
import { randomUUID } from "node:crypto";
import {
  type PipelineDefinition,
  type PipelineRun,
  type PipelineStage,
  type StageResult,
  getPipelineDir,
  getPipelineRunDir
} from "shared";
import { PipelineStore } from "./pipeline-store";
import { sessionManager } from "../core/session-manager";
import { createProgrammaticSessionSync } from "../auth/onboarding";
import { getLastAssistantText } from "../core/agent-utils";
import { broadcastToUser } from "../ws/handler";

const isWin = platform() === "win32";

export class PipelineRunner {
  private static activeRuns = new Map<string, { abort: () => void }>();

  static async run(username: string, pipelineId: string, triggeredBy: "manual" | "agent" = "manual"): Promise<string> {
    const pipeline = await PipelineStore.getPipeline(username, pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }

    const runId = `run_${randomUUID()}`;
    const startedAt = new Date().toISOString();

    const stageResults: StageResult[] = pipeline.stages.map((stage) => ({
      stageId: stage.id,
      status: "pending" as const,
      output: {},
      rawOutput: "",
    }));

    const run: PipelineRun = {
      id: runId,
      pipelineId,
      status: "running",
      triggeredBy,
      startedAt,
      stageResults,
    };

    // Save initial run state to disk
    await PipelineStore.saveRun(username, pipelineId, run);

    // Broadcast run started event
    broadcastToUser(username, {
      type: "pipeline_run_started",
      pipelineId,
      runId,
    });

    const abortController = new AbortController();
    this.activeRuns.set(`${username}:${runId}`, {
      abort: () => abortController.abort(),
    });

    // Execute in background (fire-and-forget)
    this.executePipelineInBackground(username, pipeline, run, abortController.signal).catch((err) => {
      console.error(`Error executing pipeline ${pipelineId} run ${runId}:`, err);
    });

    return runId;
  }

  static abortRun(username: string, runId: string): void {
    const key = `${username}:${runId}`;
    const run = this.activeRuns.get(key);
    if (run) {
      run.abort();
      this.activeRuns.delete(key);
    }
  }

  private static async executePipelineInBackground(
    username: string,
    pipeline: PipelineDefinition,
    run: PipelineRun,
    signal: AbortSignal
  ): Promise<void> {
    const previousOutputs: Record<string, Record<string, any>> = {};
    const startTime = Date.now();
    let failedStageId: string | undefined;
    let failedErrorMessage: string | undefined;

    try {
      for (let i = 0; i < pipeline.stages.length; i++) {
        if (signal.aborted) {
          throw new Error("Pipeline execution aborted by user");
        }

        const stage = pipeline.stages[i];
        const stageResult = run.stageResults.find((r) => r.stageId === stage.id);
        if (!stageResult) continue;

        stageResult.status = "running";
        stageResult.startedAt = new Date().toISOString();
        await PipelineStore.saveRun(username, pipeline.id, run);

        broadcastToUser(username, {
          type: "pipeline_stage_started",
          pipelineId: pipeline.id,
          runId: run.id,
          stageId: stage.id,
          stageIndex: i,
          total: pipeline.stages.length,
        });

        try {
          const result = await this.executeStage(username, pipeline.id, run.id, stage, previousOutputs, signal);
          
          stageResult.status = "completed";
          stageResult.finishedAt = new Date().toISOString();
          stageResult.output = result.output;
          stageResult.rawOutput = result.rawOutput;
          stageResult.sessionId = result.sessionId;
          stageResult.tokensIn = result.tokensIn;
          stageResult.tokensOut = result.tokensOut;
          
          previousOutputs[stage.id] = result.output;
          await PipelineStore.saveRun(username, pipeline.id, run);

          broadcastToUser(username, {
            type: "pipeline_stage_completed",
            pipelineId: pipeline.id,
            runId: run.id,
            stageId: stage.id,
            output: result.output,
          });
        } catch (stageErr: any) {
          stageResult.status = "failed";
          stageResult.finishedAt = new Date().toISOString();
          stageResult.rawOutput = stageErr.message || String(stageErr);
          
          failedStageId = stage.id;
          failedErrorMessage = stageErr.message || String(stageErr);
          
          await PipelineStore.saveRun(username, pipeline.id, run);

          broadcastToUser(username, {
            type: "pipeline_stage_failed",
            pipelineId: pipeline.id,
            runId: run.id,
            stageId: stage.id,
            error: failedErrorMessage,
          });
          
          throw stageErr; // Break the execution loop
        }
      }

      // Pipeline completed successfully
      run.status = "completed";
      run.finishedAt = new Date().toISOString();
      await PipelineStore.saveRun(username, pipeline.id, run);

      broadcastToUser(username, {
        type: "pipeline_run_completed",
        pipelineId: pipeline.id,
        runId: run.id,
        durationMs: Date.now() - startTime,
      });

    } catch (err: any) {
      // Pipeline failed
      run.status = "failed";
      run.finishedAt = new Date().toISOString();
      run.error = {
        stageId: failedStageId || "unknown",
        message: failedErrorMessage || err.message || String(err),
      };
      await PipelineStore.saveRun(username, pipeline.id, run);

      broadcastToUser(username, {
        type: "pipeline_run_failed",
        pipelineId: pipeline.id,
        runId: run.id,
        stageId: run.error.stageId,
        error: run.error.message,
      });
    } finally {
      this.activeRuns.delete(`${username}:${run.id}`);
    }
  }

  private static async executeStage(
    username: string,
    pipelineId: string,
    runId: string,
    stage: PipelineStage,
    previousOutputs: Record<string, Record<string, any>>,
    signal: AbortSignal
  ): Promise<{ output: Record<string, any>; rawOutput: string; sessionId?: string; tokensIn?: number; tokensOut?: number }> {
    
    const timeoutMs = stage.timeoutMs || (stage.type === "script" ? 120_000 : 300_000);

    if (stage.type === "script") {
      return this.executeScriptStage(username, pipelineId, runId, stage, previousOutputs, timeoutMs, signal);
    } else {
      return this.executeAgentStage(username, pipelineId, runId, stage, previousOutputs, timeoutMs, signal);
    }
  }

  private static async executeScriptStage(
    username: string,
    pipelineId: string,
    runId: string,
    stage: any, // ScriptStage
    previousOutputs: Record<string, Record<string, any>>,
    timeoutMs: number,
    signal: AbortSignal
  ): Promise<{ output: Record<string, any>; rawOutput: string }> {
    
    return new Promise((resolve, reject) => {
      const runDir = getPipelineRunDir(username, pipelineId, runId);
      const artifactsDir = join(runDir, "artifacts");
      PipelineStore.ensurePipelineDirs(username, pipelineId);
      const scriptsDir = join(getPipelineDir(username, pipelineId), "scripts");

      const scriptPath = join(scriptsDir, stage.script);
      const scriptExists = existsSync(scriptPath);

      let cmd = "bash";
      let args: string[] = [];

      if (scriptExists) {
        if (stage.script.endsWith(".ps1")) {
          cmd = "powershell.exe";
          args = ["-NoProfile", "-NonInteractive", "-File", scriptPath];
        } else if (stage.script.endsWith(".bat") || stage.script.endsWith(".cmd")) {
          cmd = "cmd.exe";
          args = ["/c", scriptPath];
        } else {
          cmd = "bash";
          args = [scriptPath];
        }
      } else {
        // Treat as inline script
        if (isWin) {
          cmd = "powershell.exe";
          args = ["-NoProfile", "-NonInteractive", "-Command", stage.script];
        } else {
          cmd = "bash";
          args = ["-c", stage.script];
        }
      }

      // Build Env Vars
      const userEnv = sessionManager.userConfig.getUserEnv(username);
      const token = createProgrammaticSessionSync(username);

      const env: Record<string, string> = {
        ...process.env,
        ...userEnv,
        PIPELINE_ID: pipelineId,
        PIPELINE_RUN_ID: runId,
        PIPELINE_ARTIFACTS_DIR: artifactsDir,
        TOKEN: token,
        JWT_TOKEN: token,
      };

      // Add previous outputs to env
      for (const [prevStageId, output] of Object.entries(previousOutputs)) {
        const envKey = `STAGE_${prevStageId.toUpperCase()}_OUTPUT`;
        env[envKey] = JSON.stringify(output);
      }

      const proc = spawn(cmd, args, {
        cwd: runDir,
        env,
        signal,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (data) => {
        const chunk = data.toString("utf-8");
        stdout += chunk;
        // Optionally stream logs via WS
        broadcastToUser(username, {
          type: "pipeline_stage_log",
          pipelineId,
          runId,
          stageId: stage.id,
          stream: "stdout",
          text: chunk,
        });
      });

      proc.stderr?.on("data", (data) => {
        const chunk = data.toString("utf-8");
        stderr += chunk;
        broadcastToUser(username, {
          type: "pipeline_stage_log",
          pipelineId,
          runId,
          stageId: stage.id,
          stream: "stderr",
          text: chunk,
        });
      });

      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error(`Stage ${stage.id} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      proc.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          const parsedOutput = this.parseOutputBlock(stdout);
          resolve({
            output: parsedOutput,
            rawOutput: stdout + (stderr ? `\n--- STDERR ---\n${stderr}` : ""),
          });
        } else {
          reject(new Error(`Script exited with code ${code}. Stderr: ${stderr || "none"}`));
        }
      });

      proc.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  private static async executeAgentStage(
    username: string,
    pipelineId: string,
    runId: string,
    stage: any, // AgentStage
    previousOutputs: Record<string, Record<string, any>>,
    timeoutMs: number,
    signal: AbortSignal
  ): Promise<{ output: Record<string, any>; rawOutput: string; sessionId: string; tokensIn?: number; tokensOut?: number }> {
    
    const agentSessionId = `run_${runId}_${stage.id}`;
    
    // Create the session
    const session = await sessionManager.getOrCreateSession(
      username,
      agentSessionId,
      undefined, // projectName
      stage.agentId || undefined
    );

    // Make sure we have a model configured
    const { modelRegistry } = sessionManager.userConfig.getUserContext(username);
    if (!session.model || !modelRegistry.hasConfiguredAuth(session.model)) {
      const available = modelRegistry.getAvailable();
      if (available.length > 0) {
        await session.setModel(available[0]);
      }
    }

    // Build stage prompt
    let finalPrompt = this.interpolatePrompt(stage.prompt, previousOutputs);

    const contextLines: string[] = [];
    contextLines.push(`[PIPELINE CONTEXT - Stage: ${stage.name}]`);
    contextLines.push(`Pipeline Run ID: ${runId}`);
    contextLines.push("Previous stages outputs:");
    for (const [prevStageId, prevOutput] of Object.entries(previousOutputs)) {
      contextLines.push(`- ${prevStageId}: ${JSON.stringify(prevOutput)}`);
    }
    contextLines.push("\n");

    finalPrompt = contextLines.join("\n") + finalPrompt;

    if (stage.outputSchema && stage.outputSchema.length > 0) {
      finalPrompt += `\n\n[REQUIRED OUTPUT FORMAT]
At the end of your response, output a JSON block with this structure:
---OUTPUT---
{
  ${stage.outputSchema.map((f: any) => `"${f.name}": ... (${f.description})`).join(",\n  ")}
}
---END OUTPUT---`;
    }

    // Capture and stream subagent/agent chunks via websocket
    const unsub = session.subscribe((event) => {
      // Forward assistant chunk stream to UI
      if (event.type === "agent_streaming" && event.chunk) {
        broadcastToUser(username, {
          type: "pipeline_stage_log",
          pipelineId,
          runId,
          stageId: stage.id,
          stream: "stdout",
          text: event.chunk,
        });
      }
    });

    try {
      // Execute prompt with timeout
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Stage ${stage.id} timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        const onAbort = () => {
          clearTimeout(timeout);
          reject(new Error("Pipeline execution aborted by user"));
        };

        if (signal.aborted) {
          onAbort();
          return;
        }

        signal.addEventListener("abort", onAbort);

        session.prompt(finalPrompt).then(() => {
          clearTimeout(timeout);
          signal.removeEventListener("abort", onAbort);
          resolve();
        }).catch((err) => {
          clearTimeout(timeout);
          signal.removeEventListener("abort", onAbort);
          reject(err);
        });
      });

      const rawOutput = getLastAssistantText(session.messages);
      const parsedOutput = this.parseOutputBlock(rawOutput);

      // Get last prompt statistics
      let tokensIn = 0;
      let tokensOut = 0;
      try {
        const stats = (session as any).getSessionStats?.();
        if (stats && stats.tokens) {
          tokensIn = stats.tokens.input || 0;
          tokensOut = stats.tokens.output || 0;
        }
        if (tokensIn === 0 && tokensOut === 0 && session.messages) {
          for (const m of session.messages) {
            const anyM = m as any;
            if (anyM.usage) {
              tokensIn += anyM.usage.input || 0;
              tokensOut += anyM.usage.output || 0;
            }
          }
        }
      } catch (e) {
        console.warn("Failed to extract session tokens:", e);
      }

      return {
        output: parsedOutput,
        rawOutput,
        sessionId: agentSessionId,
        tokensIn,
        tokensOut,
      };
    } finally {
      unsub();
      // Clean up session in manager to free memory
      try {
        await sessionManager.destroySession(username, agentSessionId);
      } catch (err) {
        console.error(`Failed to cleanup pipeline stage session ${agentSessionId}:`, err);
      }
    }
  }

  private static interpolatePrompt(prompt: string, previousOutputs: Record<string, Record<string, any>>): string {
    let result = prompt;

    // Replace {{stages.stageId.output.field}}
    const fieldRegex = /\{\{stages\.([a-zA-Z0-9_-]+)\.output\.([a-zA-Z0-9_-]+)\}\}/g;
    result = result.replace(fieldRegex, (match, stageId, fieldName) => {
      const stageOutput = previousOutputs[stageId] || {};
      const val = stageOutput[fieldName];
      return val !== undefined ? (typeof val === "object" ? JSON.stringify(val) : String(val)) : "";
    });

    // Replace {{stages.stageId.output}}
    const outputRegex = /\{\{stages\.([a-zA-Z0-9_-]+)\.output\}\}/g;
    result = result.replace(outputRegex, (match, stageId) => {
      const stageOutput = previousOutputs[stageId] || {};
      return JSON.stringify(stageOutput);
    });

    return result;
  }

  private static parseOutputBlock(stdout: string): Record<string, any> {
    const match = stdout.match(/---OUTPUT---([\s\S]*?)(?:---(?:END OUTPUT|END)---|$)/);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1].trim());
      } catch (e) {
        console.error("Failed to parse JSON from output block:", e);
      }
    }
    // Fallback: try to find any JSON block
    try {
      const jsonStart = stdout.indexOf("{");
      const jsonEnd = stdout.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        const candidate = stdout.slice(jsonStart, jsonEnd + 1);
        return JSON.parse(candidate);
      }
    } catch {}
    return {};
  }
}
