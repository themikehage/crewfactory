export interface ResolveAgentDefinitionParams {
  username: string;
  resolvedAgentId?: string;
  getDefaultModel: () => string | null;
}

export async function resolveAgentDefinition({
  username,
  resolvedAgentId,
  getDefaultModel,
}: ResolveAgentDefinitionParams): Promise<{ agentDef?: any }> {
  let agentDef: any;

  if (resolvedAgentId) {
    const { agentRegistry } = await import("../../agents");
    if (resolvedAgentId === "lab-architect") {
      try {
        if (!agentRegistry.get("lab-architect")) {
          const { LAB_ARCHITECT_DEFINITION } = await import("../prompts/lab-architect");
          const userDefaultModel = getDefaultModel();
          const modelId = userDefaultModel || "";
          await agentRegistry.register(
            username,
            {
              ...LAB_ARCHITECT_DEFINITION,
              model: modelId,
              skills: [],
            },
            false
          );
        }
      } catch (e) {
        console.error("Failed to register lab-architect:", e);
      }
    }
    const agentEntry = agentRegistry.get(resolvedAgentId);
    agentDef = agentEntry?.server.definition;
  }

  return { agentDef };
}
