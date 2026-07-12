import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import jwt from "jsonwebtoken";
import {
  createAgentSession,
  AuthStorage,
  ModelRegistry,
  SessionManager as VendoredSessionManager,
  DefaultResourceLoader,
  createBashToolDefinition,
} from "../../ai";
import { createUiTools } from "./ui-tools";
import { sessionManager } from "../session-manager";
import { filterSecretsFromOutput } from "../bash-output-filter";
import { getEnvironmentContext } from "../env-check";
import { SessionPrefix } from "shared";
import { parseEnvelope, forwardSubagentEvents, getLastAssistantText, formatDelegationResultMessage } from "../agent-utils";
import { delegationRegistry } from "../delegation-registry";

export interface SpawnSubagentOptions {
  workspaceDir: string;
  username: string;
  parentSessionId: string;
  modelRegistry: ModelRegistry;
  authStorage: AuthStorage;
  resourceLoader: DefaultResourceLoader;
}

export function createSpawnSubagentTool(opts: SpawnSubagentOptions) {
  const { workspaceDir, username, parentSessionId, modelRegistry, authStorage, resourceLoader } = opts;

  return {
    name: "spawn_subagent",
    description: `Delegate a focused, self-contained task to a subagent with fresh context.
The subagent runs in isolation (no shared memory with this conversation).
Returns a structured result envelope with status, summary, artifacts, and risks.
Use for: isolated file writes, code review, build execution, research tasks.
Do NOT use for quick single-line reads or trivial edits you can do inline.`,
    parameters: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "The complete task prompt for the subagent. Must be fully self-contained — include all context the subagent needs (file paths, requirements, constraints). The subagent has no memory of this conversation.",
        },
        subagentRole: {
          type: "string",
          description: "Optional system role for the subagent (e.g. 'You are a senior TypeScript reviewer. Be strict and adversarial.'). Injected as the system prompt prefix.",
        },
        maxSteps: {
          type: "number",
          description: "Maximum agent loop steps. Defaults to 15. Use lower values (5-8) for simple tasks, higher (20-30) for complex multi-file work.",
        },
      },
      required: ["task"],
    },
    execute: async (toolCallId: string, args: any, parentSignal?: AbortSignal) => {
      // Determine parent entity metadata
      const parentMeta = sessionManager.getSessionMetadata(username, parentSessionId) || {};
      let parentEntityType = "global";
      let parentEntityId: string | null = null;

      if (parentMeta.channelId) {
        parentEntityType = "channel";
        parentEntityId = parentMeta.channelId;
      } else if (parentMeta.agentId) {
        parentEntityType = "agent";
        parentEntityId = parentMeta.agentId;
      } else if (parentMeta.projectName) {
        parentEntityType = "project";
        parentEntityId = parentMeta.projectName;
      }

      // 1. Create a directory for the subagent session
      const userDir = sessionManager.ensureUserDir(username);
      const subagentSessionId = `${SessionPrefix.SUBAGENT}${toolCallId}`;
      const subagentDir = join(userDir, "sessions", parentSessionId, "subagents", subagentSessionId);
      mkdirSync(subagentDir, { recursive: true });

      // 2. Write initial metadata.json
      const metadata = {
        subagentId: subagentSessionId,
        parentSessionId,
        parentEntityType,
        parentEntityId,
        task: args.task.slice(0, 500),
        subagentRole: args.subagentRole || null,
        startedAt: new Date().toISOString(),
        completedAt: null as string | null,
        status: "running",
        isSubagent: true,
      };
      writeFileSync(join(subagentDir, "metadata.json"), JSON.stringify(metadata, null, 2), "utf-8");

      // 3. Setup subagent session persistence and resources
      const subSessionManager = VendoredSessionManager.create(subagentDir, subagentDir);

      const customBashTool = createBashToolDefinition(workspaceDir, {
        spawnHook: (context) => {
          const userEnv = sessionManager.getUserEnv(username);
          const token = jwt.sign(
            { username },
            process.env.JWT_SECRET!,
            { expiresIn: "7d" }
          );
          return {
            ...context,
            env: {
              ...context.env,
              ...userEnv,
              TOKEN: token,
              JWT_TOKEN: token,
            },
          };
        },
        outputFilter: (output: string) => {
          const userEnv = sessionManager.getUserEnv(username);
          const secrets = Object.values(userEnv).filter(Boolean);
          return filterSecretsFromOutput(output, secrets);
        },
      });

      const uiTools = createUiTools(workspaceDir, username);

      const subagentInstructions = [
        `\n\n## Subagent Executor Mode`,
        `You are a SUBAGENT EXECUTOR. Your goal is to perform a focused task on behalf of the parent agent orchestrator.`,
        `The task you must perform is:`,
        `"""\n${args.task}\n"""`,
        args.subagentRole ? `\nRole context: ${args.subagentRole}` : "",
        `\n## Executor Contract`,
        `1. Perform the task directly using your tools.`,
        `2. Save any artifacts (files) before your final text response.`,
        `3. Your final message MUST contain the structured result envelope below.`,
        `Return the result envelope exactly in this format as your last message:`,
        `---`,
        `status: success | partial | blocked`,
        `executive_summary: <1-3 sentences summarizing what was accomplished>`,
        `artifacts: <comma-separated list of files created/modified, or "none">`,
        `risks: <any risks found, or "None">`,
        `---`
      ].filter(Boolean).join("\n");

      const envContext = getEnvironmentContext(workspaceDir);
      const subResourceLoader = new DefaultResourceLoader({
        cwd: workspaceDir,
        agentDir: userDir,
        additionalSkillPaths: resourceLoader.getSkills().skills.map(s => s.baseDir),
        appendSystemPrompt: [
          subagentInstructions,
          `\n\nRuntime Environment:\n${envContext}`
        ],
      });
      await subResourceLoader.reload();

      const { session: subSession } = await createAgentSession({
        cwd: workspaceDir,
        sessionManager: subSessionManager,
        authStorage,
        modelRegistry,
        resourceLoader: subResourceLoader,
        customTools: [customBashTool as any, ...uiTools as any],
      });

      // Enable subagent tools
      subSession.setActiveToolsByName([
        "read", "write", "edit", "bash", "grep", "find", "ls",
        "request_approval", "ask_question", "render_images",
        "render_html", "render_chart", "share_file", "refresh_ui",
        "vision", "generate_image",
      ]);

      // Inherit model from parent session
      const parentSession = sessionManager.getSession(username, parentSessionId);
      if (parentSession && parentSession.model) {
        await subSession.setModel(parentSession.model);
      }

      // 4. Handle abort signal chaining
      const onAbort = () => {
        subSession.abort();
      };
      if (parentSignal) {
        parentSignal.addEventListener("abort", onAbort, { once: true });
      }

      // Subscribe to subagent session logs and forward them via parent session WebSocket
      const subagentUnsub = forwardSubagentEvents(subSession, parentSessionId, subagentSessionId, toolCallId);

      // Register the delegation in memory and disk
      delegationRegistry.register(
        username,
        parentSessionId,
        {
          toolCallId,
          parentSessionId,
          targetType: "spawn",
          targetLabel: `Subagent (${args.subagentRole || "executor"})`,
          task: args.task,
          status: "running",
          startedAt: metadata.startedAt,
          subagentSessionId,
        },
        () => {
          subSession.abort();
        }
      );

      // 5. Execute subagent prompt loop in background
      subSession.prompt(args.task)
        .then(async () => {
          let status = "success";
          const lastText = getLastAssistantText(subSession.messages);
          const envelope = parseEnvelope(lastText);

          if (parentSignal?.aborted) {
            status = "blocked";
            envelope.status = "blocked";
            envelope.executive_summary = "Subagent execution was aborted by the parent orchestrator.";
          } else {
            status = envelope.status;
          }

          // Update completion metadata
          metadata.status = status;
          metadata.completedAt = new Date().toISOString();
          try {
            writeFileSync(join(subagentDir, "metadata.json"), JSON.stringify(metadata, null, 2), "utf-8");
          } catch (e) {
            console.error("Failed to write subagent metadata.json", e);
          }

          // Complete in registry
          delegationRegistry.complete(username, parentSessionId, toolCallId, status as any, envelope);

          // Add to parent session's result queue
          const parent = sessionManager.getSession(username, parentSessionId);
          if (parent) {
            const toolResultMsg = formatDelegationResultMessage(toolCallId, "spawn_subagent", envelope, subagentSessionId, lastText);
            parent.addDelegationResult(toolResultMsg);

            // If parent is not active streaming, prompt it to wake up
            if (!parent.isStreaming) {
              const wakeMessage = `[SYSTEM: DELEGATION SUCCESS] Subagent session ${subagentSessionId} completed successfully. The delegation tool result has been received and enqueued. Please review the result and continue.`;
              parent.prompt(wakeMessage).catch((e) => {
                console.error("[Subagent Async Return] Parent prompt fail:", e);
              });
            }
          } else {
            console.warn(`[Subagent] Parent session ${parentSessionId} not found for toolCallId ${toolCallId} — delegation result discarded`);
          }
        })
        .catch(async (err) => {
          console.error(`[Subagent Execution Error] ${subagentSessionId}:`, err);
          const envelope = {
            status: "error" as const,
            executive_summary: `Subagent execution failed: ${err.message || err}`,
            artifacts: "none",
            risks: "Execution encountered an error.",
          };

          metadata.status = "error";
          metadata.completedAt = new Date().toISOString();
          try {
            writeFileSync(join(subagentDir, "metadata.json"), JSON.stringify(metadata, null, 2), "utf-8");
          } catch (e) {}

          delegationRegistry.complete(username, parentSessionId, toolCallId, "error", envelope);

          const parent = sessionManager.getSession(username, parentSessionId);
          if (parent) {
            const toolResultMsg = formatDelegationResultMessage(toolCallId, "spawn_subagent", envelope, subagentSessionId);
            parent.addDelegationResult(toolResultMsg);

            if (!parent.isStreaming) {
              const wakeMessage = `[SYSTEM: DELEGATION ERROR] Subagent session ${subagentSessionId} failed: ${envelope.executive_summary}. The error result has been enqueued. Please check and proceed.`;
              parent.prompt(wakeMessage).catch((e) => {
                console.error("[Subagent Async Return] Parent prompt fail on error:", e);
              });
            }
          } else {
            console.warn(`[Subagent] Parent session ${parentSessionId} not found for toolCallId ${toolCallId} — delegation result discarded`);
          }
        })
        .finally(() => {
          subagentUnsub();
          if (parentSignal) {
            parentSignal.removeEventListener("abort", onAbort);
          }
        });

      // Return immediately
      return {
        content: [{ type: "text", text: `Subagent delegation started. Subagent session ID: ${subagentSessionId}` }],
        details: { status: "delegated", subagentSessionId, task: args.task },
        terminate: true,
      };
    },
  };
}
