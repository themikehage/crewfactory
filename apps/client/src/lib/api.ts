export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = localStorage.getItem("token");
  const headers = new Headers(init?.headers);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    window.dispatchEvent(new Event("auth-unauthorized"));
  }
  return res;
}
