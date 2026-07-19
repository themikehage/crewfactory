import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createProgrammaticSessionSync } from "../../auth/onboarding";
import {
  AuthStorage,
  ModelRegistry,
  DefaultResourceLoader,
  createBashToolDefinition,
} from "../../ai";
import { createUiTools } from "./ui-tools";
import { sessionManager } from "../session-manager";
import { filterSecretsFromOutput } from "../bash-output-filter";
import { assemblePromptAppends } from "../prompts/prompt-assembly";
import { SessionPrefix } from "shared";
import { parseEnvelope, forwardSubagentEvents, getLastAssistantText, formatDelegationResultMessage } from "../agent-utils";
import { delegationRegistry } from "../delegation-registry";
import { AbortToken } from "../abort-token";
import { getAppConfig } from "../../config/app-config";
import { getSubagentDepth } from "../session/session-depth";
import { buildSubagentRules } from "../sandbox";

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
        subagentType: {
          type: "string",
          enum: ["explorer", "builder", "autonomous"],
          description: "Optional subagent type. 'explorer' is restricted to read-only tools, 'builder' is permitted to edit files and run commands (subject to user confirmation), and 'autonomous' is permitted to edit files and run commands autonomously (without confirmation). Defaults to 'builder'.",
        },
        maxSteps: {
          type: "number",
          description: "Maximum agent loop steps. Defaults to 15. Use lower values (5-8) for simple tasks, higher (20-30) for complex multi-file work.",
        },
      },
      required: ["task"],
    },
    execute: async (toolCallId: string, args: any, parentSignal?: AbortSignal) => {
      const userSettings = sessionManager.userConfig.getUserSettings(username);
      const appConfig = getAppConfig();
      const maxDepth = userSettings.subagentMaxDepth !== undefined
         ? Number(userSettings.subagentMaxDepth)
         : appConfig.subagent.maxDepth;

      const currentDepth = getSubagentDepth(username, parentSessionId);
      if (currentDepth >= maxDepth) {
        throw new Error(
          `Subagent depth limit reached (${maxDepth}). Current depth: ${currentDepth}. Cannot spawn nested subagents.`
        );
      }

      const parentMeta = sessionManager.metadataStore.getSessionMetadata(username, parentSessionId) || {};
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

      const userDir = sessionManager.userConfig.ensureUserDir(username);
      const subagentSessionId = `${SessionPrefix.SUBAGENT}${toolCallId}`;
      const subagentDir = join(userDir, "sessions", parentSessionId, "subagents", subagentSessionId);
      mkdirSync(subagentDir, { recursive: true });

      const parentExecutionMode = parentMeta.executionMode;
      const resolvedSubagentType = args.subagentType || (parentExecutionMode === "autonomous" ? "autonomous" : "builder");

      const effectiveRules = buildSubagentRules(
        username,
        subagentSessionId,
        parentSessionId,
        resolvedSubagentType
      );

      const derivedExecutionMode = 
        resolvedSubagentType === "explorer" ? "readonly" 
        : resolvedSubagentType === "autonomous" ? "autonomous" 
        : "standard";

      const metadata = {
        subagentId: subagentSessionId,
        parentSessionId,
        parentEntityType,
        parentEntityId,
        task: args.task.slice(0, 500),
        subagentRole: args.subagentRole || null,
        subagentType: resolvedSubagentType,
        permissionRules: effectiveRules,
        executionMode: derivedExecutionMode,
        startedAt: new Date().toISOString(),
        completedAt: null as string | null,
        status: "running",
        isSubagent: true,
        subagentDepth: currentDepth + 1,
        teamId: parentMeta.teamId || null,
      };
      writeFileSync(join(subagentDir, "metadata.json"), JSON.stringify(metadata, null, 2), "utf-8");

      // 3. Setup subagent session persistence and resources
      const customBashTool = createBashToolDefinition(workspaceDir, {
        spawnHook: (context) => {
          const userEnv = sessionManager.userConfig.getUserEnv(username);
          const token = createProgrammaticSessionSync(username);
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
          const userEnv = sessionManager.userConfig.getUserEnv(username);
          const secrets = Object.values(userEnv).filter(Boolean);
          return filterSecretsFromOutput(output, secrets);
        },
      });

      const uiTools = createUiTools(workspaceDir, username);

      const subResourceLoader = new DefaultResourceLoader({
        cwd: workspaceDir,
        agentDir: userDir,
        additionalSkillPaths: resourceLoader.getSkills().skills.map(s => s.baseDir),
        loadSkills: false,
        loadAgentsFiles: false,
        appendSystemPrompt: assemblePromptAppends({
          mode: "subagent-spawn",
          workspaceDir,
          subagentTask: args.task,
          subagentRole: args.subagentRole,
        }),
      });
      await subResourceLoader.reload();

      const subSession = await sessionManager.getOrCreateSession(
        username,
        subagentSessionId,
        undefined,
        undefined,
        undefined,
        {
          resourceLoader: subResourceLoader,
          customTools: [customBashTool as any, ...uiTools as any],
          workspaceDir,
          skipMcpTools: true,
          skipMemory: true,
        }
      );

      // Inherit model from parent session
      const parentSession = sessionManager.getSession(username, parentSessionId);
      if (parentSession && parentSession.model) {
        await subSession.setModel(parentSession.model);
      }

      // 4. Handle abort signal chaining
      const childToken = new AbortToken(parentSignal, `spawn:${subagentSessionId}`);
      childToken.register(
        () => {
          subSession.abort();
          delegationRegistry.abortAllRecursive(subagentSessionId);
        },
        `session:${subagentSessionId}`
      );

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
          childToken.abortAll();
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
          let parent = sessionManager.getSession(username, parentSessionId);
          if (!parent) {
            try {
              parent = await sessionManager.getOrCreateSession(username, parentSessionId);
            } catch (e) {
              console.error(`[Subagent] Failed to load/create parent session ${parentSessionId}`, e);
            }
          }

          if (parent) {
            const toolResultMsg = formatDelegationResultMessage(toolCallId, "spawn_subagent", envelope, subagentSessionId, lastText);
            parent.addDelegationResult(toolResultMsg);

            // If parent is not active streaming, continue execution
            if (!parent.isStreaming) {
              let success = false;
              try {
                await parent.continue();
                success = true;
              } catch (e) {
                console.error("[Subagent Async Return] Parent continue fail, will retry in 1s:", e);
                await new Promise((resolve) => setTimeout(resolve, 1000));
                try {
                  await parent.continue();
                  success = true;
                } catch (e2) {
                  console.error("[Subagent Async Return] Parent continue retry fail:", e2);
                }
              }

              if (!success) {
                try {
                  const { broadcastToUser } = await import("../../ws/handler");
                  broadcastToUser(username, {
                    type: "delegation_completed",
                    parentSessionId,
                    subagentSessionId,
                    status: "success",
                  });
                } catch (e3) {
                  console.error("Failed to broadcast fallback delegation_completed:", e3);
                }
              }
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

          let parent = sessionManager.getSession(username, parentSessionId);
          if (!parent) {
            try {
              parent = await sessionManager.getOrCreateSession(username, parentSessionId);
            } catch (e) {
              console.error(`[Subagent] Failed to load/create parent session ${parentSessionId} on error`, e);
            }
          }

          if (parent) {
            const toolResultMsg = formatDelegationResultMessage(toolCallId, "spawn_subagent", envelope, subagentSessionId);
            parent.addDelegationResult(toolResultMsg);

            if (!parent.isStreaming) {
              let success = false;
              try {
                await parent.continue();
                success = true;
              } catch (e) {
                console.error("[Subagent Async Return] Parent continue fail on error, will retry in 1s:", e);
                await new Promise((resolve) => setTimeout(resolve, 1000));
                try {
                  await parent.continue();
                  success = true;
                } catch (e2) {
                  console.error("[Subagent Async Return] Parent continue retry fail on error:", e2);
                }
              }

              if (!success) {
                try {
                  const { broadcastToUser } = await import("../../ws/handler");
                  broadcastToUser(username, {
                    type: "delegation_completed",
                    parentSessionId,
                    subagentSessionId,
                    status: "error",
                  });
                } catch (e3) {
                  console.error("Failed to broadcast fallback delegation_completed on error:", e3);
                }
              }
            }
          } else {
            console.warn(`[Subagent] Parent session ${parentSessionId} not found for toolCallId ${toolCallId} — delegation result discarded`);
          }
        })
        .finally(() => {
          subagentUnsub();
          childToken.abortAll();
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
