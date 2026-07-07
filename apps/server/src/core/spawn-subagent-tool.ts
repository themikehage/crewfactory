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
} from "../ai";
import { createUiTools } from "./ui-tools";
import { sessionManager } from "./session-manager";
import { filterSecretsFromOutput } from "./bash-output-filter";
import { getEnvironmentContext } from "./env-check";
import { SessionPrefix } from "shared";
import { parseEnvelope, forwardSubagentEvents, getLastAssistantText } from "./agent-utils";

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

      // 5. Execute subagent prompt loop
      let status = "success";
      try {
        await subSession.prompt(args.task);
      } catch (err: any) {
        status = "error";
        console.error(`[Subagent Execution Error] ${subagentSessionId}:`, err);
      } finally {
        subagentUnsub();
        if (parentSignal) {
          parentSignal.removeEventListener("abort", onAbort);
        }
      }

      // 6. Finalize, parse response, and update session tracking
      const lastText = getLastAssistantText(subSession.messages);

      const envelope = parseEnvelope(lastText);

      if (parentSignal?.aborted) {
        status = "blocked";
        envelope.status = "blocked";
        envelope.executive_summary = "Subagent execution was aborted by the parent orchestrator.";
      } else if (status === "error") {
        envelope.status = "blocked";
        envelope.executive_summary = `Subagent execution encountered an error.`;
        envelope.risks = "Execution failed before completion.";
      } else {
        status = envelope.status;
      }

      // Update completion metadata
      metadata.status = status;
      metadata.completedAt = new Date().toISOString();
      writeFileSync(join(subagentDir, "metadata.json"), JSON.stringify(metadata, null, 2), "utf-8");

      const envelopeStr = [
        "---",
        `status: ${envelope.status}`,
        `executive_summary: ${envelope.executive_summary}`,
        `artifacts: ${envelope.artifacts}`,
        `risks: ${envelope.risks}`,
        "---",
      ].join("\n");

      return {
        content: [{ type: "text", text: envelopeStr }],
        details: { ...envelope, subagentSessionId },
      };
    },
  };
}
