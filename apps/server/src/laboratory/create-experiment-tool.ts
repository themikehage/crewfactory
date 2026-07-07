import { ExperimentStore } from "./experiment-store";
import { agentRegistry } from "../agents";
import { sessionManager } from "../core/session-manager";
import { broadcastToUser } from "../ws/handler";
import { type LabExperiment, type LabAgent, type LabStance } from "shared";
import { resolveModelWithFallback } from "../core/agent-utils";

export interface CreateExperimentOptions {
  username: string;
  parentSessionId: string;
}

export function createExperimentTool(opts: CreateExperimentOptions) {
  const { username, parentSessionId } = opts;

  return {
    name: "create_experiment",
    description: `Create or update a multi-agent benchmarking experiment.
This tool performs an upsert. If experimentId is omitted or not found, it creates a new experiment with a generated UUID.
It registers the defined specialist agents dynamically in the workspace registry and constructs the 3 sequential execution variants (Single/Baseline, Horizontal, Hierarchical).`,
    parameters: {
      type: "object",
      properties: {
        experimentId: {
          type: "string",
          description: "The UUID of the experiment to update. Omit to create a new experiment.",
        },
        name: {
          type: "string",
          description: "Descriptive and friendly name of the experiment.",
        },
        taskPrompt: {
          type: "string",
          description: "The actual task or objective instruction prompt that the crew will be benchmarked on.",
        },
        criteria: {
          type: "array",
          items: { type: "string" },
          description: "Custom evaluation criteria list for the LLM judge (e.g. ['Quality', 'Efficiency', 'Completeness']).",
        },
        agents: {
          type: "array",
          description: "The complete roster of crew specialist agents for the multi-agent tracks.",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Lowercase kebab-case identifier (e.g. 'qa-engineer')." },
              name: { type: "string", description: "Human-friendly agent name." },
              role: { type: "string", description: "Specific role description of what this specialist agent does." },
              systemPrompt: { type: "string", description: "Detailed system instructions for the agent (written in Spanish)." },
              model: { type: "string", description: "Target model ID to bind to this agent (e.g. 'anthropic/claude-3-5-sonnet')." },
              skills: { type: "array", items: { type: "string" }, description: "Skills lists. Empty array by default." },
              leader: { type: "boolean", description: "Set to true if this agent coordinates tasks as the leader. Exactly one leader is required." }
            },
            required: ["id", "name", "role", "systemPrompt"]
          }
        }
      },
      required: ["name", "taskPrompt", "criteria", "agents"]
    },
    execute: async (toolCallId: string, args: any) => {
      const name: string = args.name;
      const taskPrompt: string = args.taskPrompt;
      const criteria: string[] = args.criteria || ["Quality", "Efficiency"];
      const rawAgents: any[] = args.agents || [];
      let experimentId: string = args.experimentId || crypto.randomUUID();

      if (!name || !taskPrompt || rawAgents.length === 0) {
        return {
          content: [{ type: "text", text: "Error: name, taskPrompt, and a list of agents are required." }],
          isError: true
        };
      }

      // Check if experiment exists and is running
      const existing = await ExperimentStore.getExperiment(username, experimentId);
      if (existing && existing.status === "running") {
        return {
          content: [{ type: "text", text: "Error: Cannot update an experiment that is currently running." }],
          isError: true
        };
      }

      const { modelRegistry } = sessionManager.getUserContext(username);
      const userDefaultModel = sessionManager.getUserDefaultModel(username);
      const fallbackModel = userDefaultModel || "anthropic/claude-3-5-sonnet";

      // 1. Register agents in workspace registry (if they do not already exist)
      for (const rawAg of rawAgents) {
        const regId = rawAg.id;
        const resolvedModel = resolveModelWithFallback(rawAg.model || fallbackModel, modelRegistry);
        
        // Register or update agent
        try {
          if (agentRegistry.get(regId)) {
            // Update definition
            await agentRegistry.update(username, regId, {
              name: rawAg.name,
              role: rawAg.role,
              systemPrompt: rawAg.systemPrompt,
              model: resolvedModel,
              skills: rawAg.skills || []
            });
          } else {
            // Register fresh
            await agentRegistry.register(username, {
              id: regId,
              name: rawAg.name,
              role: rawAg.role,
              systemPrompt: rawAg.systemPrompt,
              model: resolvedModel,
              skills: rawAg.skills || []
            }, true);
          }
        } catch (err: any) {
          console.error(`[create_experiment Tool] Failed to register agent ${regId}:`, err);
        }
      }

      // 2. Map lab stances
      const stances: LabStance[] = rawAgents.map((ag) => ({
        id: ag.id,
        name: ag.name,
        template: "",
        position: ag.leader ? "LEADER" : "AGENT",
        briefing: ag.systemPrompt,
        icon: ag.leader ? "Award" : "User",
        color: ag.leader ? "#a855f7" : "#3b82f6"
      }));

      // 3. Compose variants
      const singleAgents: LabAgent[] = [
        {
          id: rawAgents[0].id,
          name: rawAgents[0].name,
          role: rawAgents[0].role,
          stance: stances[0],
          systemPrompt: rawAgents[0].systemPrompt,
          model: rawAgents[0].model || fallbackModel
        }
      ];

      const multiNoLeaderAgents: LabAgent[] = rawAgents
        .filter(a => !a.leader)
        .map(a => ({
          id: a.id,
          name: a.name,
          role: a.role,
          stance: stances.find(s => s.id === a.id)!,
          systemPrompt: a.systemPrompt,
          model: a.model || fallbackModel
        }));

      const multiWithLeaderAgents: LabAgent[] = rawAgents.map(a => ({
        id: a.id,
        name: a.name,
        role: a.role,
        stance: stances.find(s => s.id === a.id)!,
        systemPrompt: a.systemPrompt,
        model: a.model || fallbackModel,
        leader: a.leader
      }));

      // 4. Save LabExperiment
      const experiment: LabExperiment = {
        id: experimentId,
        name,
        taskPrompt,
        status: existing?.status || "designing",
        positions: stances,
        judge: {
          criteria,
          autoEvaluate: true
        },
        variants: {
          single: { type: "single", agents: singleAgents },
          multiNoLeader: { type: "multi_no_leader", agents: multiNoLeaderAgents },
          multiWithLeader: { type: "multi_with_leader", agents: multiWithLeaderAgents }
        },
        createdAt: existing?.createdAt || new Date().toISOString(),
        blueprintId: existing?.blueprintId
      };

      await ExperimentStore.saveExperiment(username, experiment);

      // Trigger UI updates
      broadcastToUser(username, {
        type: "entity-updated",
        entityType: "experiment"
      });

      broadcastToUser(username, {
        type: "experiment_status",
        experimentId,
        status: experiment.status,
        experiment
      });

      // Bind this session to the newly created experiment if it wasn't bound
      try {
        const metadata = sessionManager.getSessionMetadata(username, parentSessionId);
        if (metadata && !metadata.experimentId) {
          sessionManager.saveSessionMetadata(username, parentSessionId, {
            ...metadata,
            experimentId: experimentId
          });
        }
      } catch {}

      return {
        content: [{
          type: "text",
          text: `Experiment "${name}" (ID: ${experimentId}) successfully ${existing ? "updated" : "created"} with ${rawAgents.length} agents.`
        }],
        details: {
          experimentId,
          name,
          agentsCount: rawAgents.length,
          criteria
        }
      };
    }
  };
}
