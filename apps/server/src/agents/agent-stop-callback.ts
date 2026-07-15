let onAgentStopCallback: ((agentId: string) => void) | null = null;

export function setAgentStopCallback(fn: (agentId: string) => void) {
  onAgentStopCallback = fn;
}

export function getAgentStopCallback(): ((agentId: string) => void) | null {
  return onAgentStopCallback;
}
