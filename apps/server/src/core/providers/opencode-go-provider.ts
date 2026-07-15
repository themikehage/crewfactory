import { ModelRegistry } from "../../ai";
import { loadProviderModels } from "./provider-persistence";

export function registerOpenCodeGoProvider(registry: ModelRegistry, username?: string) {
  const persisted = username ? loadProviderModels(username, "opencode-go") : null;

  registry.registerProvider("opencode-go", {
    name: "OpenCode Go",
    baseUrl: "https://opencode.ai/zen/go/v1",
    apiKey: "$OPENCODE_API_KEY",
    api: "openai-completions",
    dynamic: true,
    models: persisted ?? [],
  });
}
