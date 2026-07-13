export function resolveMediaUrl(src: string, sessionId: string | null): string {
  if (!src) return "";
  if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:")) {
    return src;
  }
  const cleanPath = src.startsWith("/") ? src.substring(1) : src;
  if (sessionId) {
    return `/api/sessions/${sessionId}/files/${cleanPath}`;
  }
  return `/api/workspace/${cleanPath}`;
}
