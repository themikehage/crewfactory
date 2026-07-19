export function resolveFileUrl(
  url: string,
  sessionId: string | null,
  opts?: {
    project?: string | null;
    agentId?: string | null;
    channelId?: string | null;
    teamId?: string | null;
  }
): string {
  if (!url) return "";

  if (url.startsWith("data:") || url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  if (sessionId && (url.includes("/tmp/") || url.includes("C:\\tmp\\") || url.includes("C:/tmp/"))) {
    const sessionMarker = `sessions/${sessionId}/`;
    const idx = url.indexOf(sessionMarker);
    if (idx !== -1) {
      const relativePath = url.substring(idx + sessionMarker.length);
      const cleanedPath = relativePath.replace(/\\/g, "/");
      return `/api/sessions/${sessionId}/files/${cleanedPath}`;
    }

    const match = url.match(/sessions\/([a-zA-Z0-9-]+)\/(.+)/);
    if (match) {
      const cleanedPath = match[2].replace(/\\/g, "/");
      return `/api/sessions/${match[1]}/files/${cleanedPath}`;
    }

    const baseName = url.split(/[\\/]/).pop();
    if (baseName) {
      return `/api/sessions/${sessionId}/files/${baseName}`;
    }
  }

  let cleanPath = url.replace(/\\/g, "/");
  if (cleanPath.startsWith("workspace/")) {
    cleanPath = cleanPath.substring("workspace/".length);
  }
  const params = new URLSearchParams();
  if (opts?.project) params.append("project", opts.project);
  if (opts?.agentId) params.append("agentId", opts.agentId);
  if (opts?.channelId) params.append("channelId", opts.channelId);
  if (opts?.teamId) params.append("teamId", opts.teamId);
  params.append("raw", "true");
  return `/api/workspace/${cleanPath}?${params.toString()}`;
}
