import { promptFragmentRegistry, type PromptFragment } from "./registry";

export interface DeploymentMember {
  agentId: string;
  agentName: string;
  role: string;
  replyMode: string;
}

export interface DeploymentContext {
  mode: "broadcast" | "targeted" | "solo";
  channelId?: string;
  agentRole?: string;
  members?: DeploymentMember[];
  negotiationProtocol?: boolean;
  isArbiter?: boolean;
  selfReplyMode?: string;
  leaderName?: string;
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
    if (deployment.mode !== "solo") {
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

    return {
      layers: fragments.map(f => f.content),
      composed: fragments.map(f => f.content).join("\n\n"),
      applied: fragments.map(f => f.key),
    };
  }
}

export const promptComposer = new PromptComposer();
