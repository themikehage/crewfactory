import type { Team, TeamEvent, TeamMember, TeamStep } from "shared";
import { agentRegistry } from "../agents";
import { resolveModelWithFallback } from "../core/agent-utils";
import { sessionManager } from "../core/session-manager";
import { broadcastToUser } from "../ws/handler";
import { teamExecutionStore } from "./team-execution-store";

const MAX_RECOVERABLE_ATTEMPTS = 2;

export class TeamBusyError extends Error {
  constructor(readonly executionId: string) {
    super("Team already has an active execution");
  }
}

export class TeamOrchestrator {
  private active = new Map<string, { executionId: string; controller: AbortController }>();

  private key(username: string, teamId: string): string { return `${username}:${teamId}`; }

  hasActive(username: string, teamId: string): boolean { return this.active.has(this.key(username, teamId)); }
  getActiveExecutionId(username: string, teamId: string): string | undefined { return this.active.get(this.key(username, teamId))?.executionId; }

  private event(username: string, teamId: string, executionId: string, input: Parameters<TeamExecutionStore["appendEvent"]>[3]): TeamEvent {
    const event = teamExecutionStore.appendEvent(username, teamId, executionId, input);
    broadcastToUser(username, { type: "team_execution_event", teamId, executionId, event });
    return event;
  }

  async start(username: string, team: Team, task: string, requestId: string): Promise<string> {
    const duplicate = teamExecutionStore.findByRequestId(username, team.id, requestId);
    if (duplicate) return duplicate.id;
    const key = this.key(username, team.id);
    const existing = this.active.get(key);
    if (existing) throw new TeamBusyError(existing.executionId);
    const execution = teamExecutionStore.create(username, team, task, requestId);
    const controller = new AbortController();
    this.active.set(key, { executionId: execution.id, controller });
    this.event(username, team.id, execution.id, { type: "execution_started" });
    void this.run(username, team, execution.id, task, controller.signal).finally(() => this.active.delete(key));
    return execution.id;
  }

  cancel(username: string, teamId: string, executionId?: string): boolean {
    const active = this.active.get(this.key(username, teamId));
    if (!active || (executionId && executionId !== active.executionId)) return false;
    active.controller.abort();
    return true;
  }

  private async run(username: string, team: Team, executionId: string, task: string, signal: AbortSignal): Promise<void> {
    try {
      const lead = team.members.find((member) => member.role === "leader");
      const facilitator = team.members.find((member) => member.role === "facilitator");
      const workers = team.members.filter((member) => member.role === "specialist" || member.role === "participant");
      const openingOwner = team.topology === "leader_specialists" ? lead : undefined;
      const contributions: string[] = [];
      if (openingOwner) {
        const plan = await this.runMember(username, team, executionId, openingOwner, `You are coordinating this team task. Produce a concise execution plan for the specialists. Task:\n${task}`, "planning", signal);
        if (plan) contributions.push(`Leader plan:\n${plan}`);
      }
      for (const member of workers) {
        const context = contributions.length ? `\n\nWork completed so far:\n${contributions.join("\n\n")}` : "";
        const output = await this.runMember(username, team, executionId, member, `Complete your specialist contribution to this task. Be concrete and return useful work for the final synthesis.\nTask:\n${task}${context}`, "working", signal);
        if (output) contributions.push(`${member.agentId}:\n${output}`);
      }
      const finalOwner = team.topology === "leader_specialists" ? lead : facilitator;
      if (!finalOwner) throw new Error("Team has no final owner");
      const finalOutput = await this.runMember(username, team, executionId, finalOwner, `Synthesize the final answer for the user. Resolve the task end-to-end using the team contributions below. Do not describe this as a plan; deliver the result.\nTask:\n${task}\n\nContributions:\n${contributions.join("\n\n")}`, "synthesizing", signal);
      if (signal.aborted) {
        this.event(username, team.id, executionId, { type: "execution_cancelled", payload: { reason: "cancelled" } });
      } else if (finalOutput) {
        this.event(username, team.id, executionId, { type: "execution_completed", agentId: finalOwner.agentId, payload: { finalOutput } });
      } else {
        this.event(username, team.id, executionId, { type: "execution_failed", payload: { reason: "final_owner_produced_no_output" } });
      }
    } catch (error) {
      const reason = signal.aborted ? "cancelled" : error instanceof Error ? error.message : "unknown_failure";
      this.event(username, team.id, executionId, { type: signal.aborted ? "execution_cancelled" : "execution_failed", payload: { reason } });
    }
  }

  private async runMember(username: string, team: Team, executionId: string, member: TeamMember, prompt: string, phase: "planning" | "working" | "synthesizing", signal: AbortSignal): Promise<string | null> {
    if (signal.aborted) return null;
    this.event(username, team.id, executionId, { type: "phase_changed", agentId: member.agentId, payload: { phase } });
    const step = this.createStep(username, team.id, executionId, member);
    this.event(username, team.id, executionId, { type: "step_planned", stepId: step.id, agentId: member.agentId, payload: { role: member.role, index: step.index } });
    for (let attempt = 1; attempt <= MAX_RECOVERABLE_ATTEMPTS; attempt++) {
      if (signal.aborted) return null;
      this.updateStep(username, team.id, executionId, step.id, { status: "running", attempts: attempt, startedAt: new Date().toISOString() });
      this.event(username, team.id, executionId, { type: "step_started", stepId: step.id, agentId: member.agentId, payload: { attempt } });
      try {
        const output = await this.promptAgent(username, team.id, executionId, step.id, member, prompt, signal);
        if (!output) throw new Error("Agent produced no output");
        this.updateStep(username, team.id, executionId, step.id, { status: "completed", attempts: attempt, output, completedAt: new Date().toISOString() });
        this.event(username, team.id, executionId, { type: "step_completed", stepId: step.id, agentId: member.agentId, payload: { output } });
        return output;
      } catch (error) {
        const reason = error instanceof Error ? error.message : "agent_failure";
        if (signal.aborted) return null;
        if (attempt < MAX_RECOVERABLE_ATTEMPTS) {
          this.event(username, team.id, executionId, { type: "step_retried", stepId: step.id, agentId: member.agentId, payload: { attempt, reason } });
          continue;
        }
        this.updateStep(username, team.id, executionId, step.id, { status: "failed", attempts: attempt, error: reason, completedAt: new Date().toISOString() });
        this.event(username, team.id, executionId, { type: "step_failed", stepId: step.id, agentId: member.agentId, payload: { reason } });
        return null;
      }
    }
    return null;
  }

  private createStep(username: string, teamId: string, executionId: string, member: TeamMember): TeamStep {
    let result: TeamStep | undefined;
    teamExecutionStore.update(username, teamId, executionId, (execution) => {
      const now = new Date().toISOString();
      result = { id: crypto.randomUUID(), index: execution.steps.length, agentId: member.agentId, role: member.role, status: "pending", attempts: 0, createdAt: now };
      return { ...execution, steps: [...execution.steps, result] };
    });
    return result!;
  }

  private updateStep(username: string, teamId: string, executionId: string, stepId: string, changes: Partial<TeamStep>): void {
    teamExecutionStore.update(username, teamId, executionId, (execution) => ({ ...execution, steps: execution.steps.map((step) => step.id === stepId ? { ...step, ...changes } : step) }));
  }

  private async promptAgent(username: string, teamId: string, executionId: string, stepId: string, member: TeamMember, prompt: string, signal: AbortSignal): Promise<string | null> {
    const entry = agentRegistry.get(member.agentId, username);
    if (!entry || entry.status === "stopped") throw new Error(`Agent \"${member.agentId}\" is unavailable`);
    if (!entry.server.session.model) {
      const { modelRegistry } = sessionManager.userConfig.getUserContext(username);
      modelRegistry.refresh();
      const resolved = resolveModelWithFallback(undefined, modelRegistry);
      const model = resolved ? modelRegistry.getAvailable().find((candidate) => candidate.id === resolved || `${candidate.provider}/${candidate.id}` === resolved) : undefined;
      if (model) await entry.server.session.setModel(model);
    }
    if (!entry.server.session.model) throw new Error(`No model is available for agent \"${member.agentId}\"`);
    if (entry.server.session.isStreaming) throw new Error(`Agent \"${member.agentId}\" is busy`);
    let text = "";
    const unsubscribe = entry.server.session.subscribe((event) => {
      if (event.type === "message_update") {
        const content = event.message?.content;
        if (Array.isArray(content)) text = content.filter((part: { type?: string }) => part.type === "text").map((part: { text?: string }) => part.text ?? "").join("");
        this.event(username, teamId, executionId, { type: "text_delta", stepId, agentId: member.agentId, payload: { text } });
      }
      if (event.type === "tool_execution_start") this.event(username, teamId, executionId, { type: "tool_started", stepId, agentId: member.agentId, payload: { toolCallId: event.toolCallId, toolName: event.toolName } });
      if (event.type === "tool_execution_end") this.event(username, teamId, executionId, { type: "tool_completed", stepId, agentId: member.agentId, payload: { toolCallId: event.toolCallId, toolName: event.toolName, isError: event.isError } });
    });
    const abort = () => { void entry.server.session.abort(); };
    signal.addEventListener("abort", abort, { once: true });
    try {
      await entry.server.session.prompt(prompt);
      const last = [...entry.server.session.messages].reverse().find((message: { role?: string }) => message.role === "assistant");
      const content = last?.content;
      if (Array.isArray(content)) text = content.filter((part: { type?: string }) => part.type === "text").map((part: { text?: string }) => part.text ?? "").join("");
      return text.trim() || null;
    } finally {
      signal.removeEventListener("abort", abort);
      unsubscribe();
    }
  }
}

export const teamOrchestrator = new TeamOrchestrator();
