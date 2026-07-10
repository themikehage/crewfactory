import type { PromptFragment } from "../registry";

export const identityFragments: PromptFragment[] = [
  {
    key: "identity.agent_core",
    category: "identity",
    content: "Eres {name}, con el rol de {role}.\nInstrucciones de identidad:\n{systemPrompt}",
    priority: 1,
  },
];
