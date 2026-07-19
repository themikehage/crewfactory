import { promptFragmentRegistry, type PromptFragment } from "./registry";

export interface DeploymentMember {
  agentId: string;
  agentName: string;
  role: string;
  replyMode: string;
  outputMode?: "full-proposal" | "diff-suggestion" | "normal";
  capability?: string;
}

export interface DeploymentContext {
  mode: "broadcast" | "targeted" | "solo" | "orchestration" | "orchestration-team" | "negotiation-team";
  channelId?: string;
  agentRole?: string;
  members?: DeploymentMember[];
  negotiationProtocol?: boolean;
  isArbiter?: boolean;
  selfReplyMode?: string;
  leaderName?: string;
  outputMode?: "full-proposal" | "diff-suggestion" | "normal";
}

export interface LayeredPrompt {
  layers: string[];
  composed: string;
  applied: string[];
}

export class PromptComposer {
  compose(
    agentDef: { name: string; role: string; systemPrompt: string },
    deployment: DeploymentContext,
    workspaceDir?: string
  ): LayeredPrompt {
    const fragments: PromptFragment[] = [];

    // Layer 1: Identity
    const identityCore = promptFragmentRegistry.get("identity.agent_core", workspaceDir);
    if (identityCore) {
      const content = identityCore.content
        .replace("{name}", agentDef.name)
        .replace("{role}", agentDef.role)
        .replace("{systemPrompt}", agentDef.systemPrompt || "");
      fragments.push({ ...identityCore, content });
    }

    // Layer 2: Role (Skip in solo mode)
    if (deployment.mode !== "solo" && deployment.mode !== "orchestration") {
      const roleToLoad =
        deployment.agentRole === "lead" ? "role.leader" :
        deployment.agentRole === "senior" ? "role.senior" :
        deployment.agentRole === "observer" ? "role.observer" :
        "role.member";
      const roleFrags = promptFragmentRegistry.listByCategory("role", workspaceDir)
        .filter(f => f.key.startsWith(roleToLoad));
      fragments.push(...roleFrags);
    }

    // Layer 3: Instance
    if (deployment.mode === "solo") {
      const soloFrag = promptFragmentRegistry.get("instance.solo", workspaceDir);
      if (soloFrag) fragments.push(soloFrag);
    } else if (deployment.mode === "orchestration" || deployment.mode === "orchestration-team") {
      const orchestrationFrag = promptFragmentRegistry.get("instance.team.orchestration", workspaceDir);
      if (orchestrationFrag) {
        const roster = (deployment.members || [])
          .map((member) => `- ${member.agentName} (id: ${member.agentId}, role: ${member.role}, capability: ${member.capability || member.role})`)
          .join("\n");
        fragments.push({ ...orchestrationFrag, content: orchestrationFrag.content.replace("{roster}", roster) });
      }
      const leaderContract = promptFragmentRegistry.get("instance.team.orchestration.leader-contract", workspaceDir);
      if (leaderContract) {
        fragments.push(leaderContract);
      }
    } else if (deployment.mode === "negotiation-team") {
      const rosterFrag = promptFragmentRegistry.get("instance.team.negotiation.roster", workspaceDir);
      if (rosterFrag && deployment.members) {
        const roster = deployment.members
          .map((member) => `- ${member.agentName} (id: ${member.agentId}, role: ${member.role})`)
          .join("\n");
        fragments.push({ ...rosterFrag, content: rosterFrag.content.replace("{roster}", roster) });
      }
    } else {
      // Build Roster
      const rosterFrag = promptFragmentRegistry.get("instance.channel.roster", workspaceDir);
      if (rosterFrag && deployment.members) {
        const rosterLines = [
          "- @user (the human user)",
          ...deployment.members.map(m => `- @${m.agentName} (id: ${m.agentId}, role: ${m.role}, replyMode: ${m.replyMode})`)
        ].join("\n");
        const content = rosterFrag.content.replace("{roster}", rosterLines);
        fragments.push({ ...rosterFrag, content });
      }

      // Mode configuration
      const modeFragKey = deployment.mode === "broadcast" 
        ? "instance.channel.broadcast" 
        : "instance.channel.targeted";
      const modeFrag = promptFragmentRegistry.get(modeFragKey, workspaceDir);
      if (modeFrag) {
        const selfReplyMode = deployment.selfReplyMode || "broadcast";
        const leaderName = deployment.leaderName || "none";
        const content = modeFrag.content
          .replace(/{replyMode}/g, selfReplyMode)
          .replace(/{leaderName}/g, leaderName);
        fragments.push({ ...modeFrag, content });
      }
    }

    // Layer 4: Protocol
    if (deployment.mode !== "solo" && deployment.negotiationProtocol) {
      if (deployment.isArbiter) {
        const arbiterFrag = promptFragmentRegistry.get("protocol.arbitration", workspaceDir);
        if (arbiterFrag) fragments.push(arbiterFrag);
      } else {
        const negFrag = promptFragmentRegistry.get("protocol.negotiation", workspaceDir);
        if (negFrag) fragments.push(negFrag);
      }
    }

    // Layer 5: Output Format
    if (deployment.mode !== "solo" && deployment.outputMode) {
      const outputFrag = promptFragmentRegistry.get(`output-format.${deployment.outputMode}`, workspaceDir);
      if (outputFrag) fragments.push(outputFrag);
    }

    return {
      layers: fragments.map(f => f.content),
      composed: fragments.map(f => f.content).join("\n\n"),
      applied: fragments.map(f => f.key),
    };
  }
}

export const promptComposer = new PromptComposer();
