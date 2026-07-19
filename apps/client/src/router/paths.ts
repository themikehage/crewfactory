export type ContextType = "project" | "agent" | "channel" | "team";

export interface ContextPathInput {
  type: ContextType;
  id: string;
}

function contextSegment(type: ContextType): string {
  return `${type}s`;
}

export function buildContextPath({ type, id }: ContextPathInput, page = "chat"): string {
  return `/${contextSegment(type)}/${id}/${page}`;
}

export function buildSessionPath(context: ContextPathInput | null, sessionId: string): string {
  if (!context) {
    return `/session/${sessionId}`;
  }

  return `/${contextSegment(context.type)}/${context.id}/session/${sessionId}`;
}

export function buildDelegationsPath(context: ContextPathInput | null, sessionId: string | null): string {
  if (sessionId) {
    return `${buildSessionPath(context, sessionId)}/delegations`;
  }

  return context ? buildContextPath(context, "delegations") : "/delegations";
}

export function buildWorkspacePath(context: ContextPathInput | null): string {
  return context ? buildContextPath(context, "workspace") : "/workspace";
}
