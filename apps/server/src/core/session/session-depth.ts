import { sessionMetadataStore } from "./metadata-store";

export function getSubagentDepth(username: string, parentSessionId: string): number {
  let depth = 0;
  let currentId = parentSessionId;

  while (currentId) {
    const metadata = sessionMetadataStore.getSessionMetadata(username, currentId);
    if (!metadata) {
      break;
    }

    currentId = metadata.parentSessionId ?? "";
    if (currentId) {
      depth++;
    }
  }

  return depth;
}
