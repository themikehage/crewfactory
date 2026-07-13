export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const res = await fetch(url, { ...init, headers, credentials: "include" });
  if (res.status === 401) {
    window.dispatchEvent(new Event("auth-unauthorized"));
  }
  return res;
}
