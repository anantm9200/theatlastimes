export interface EditorUser { username: string }
let csrfToken = "";
export async function editorSession(): Promise<EditorUser | null> {
  const response = await fetch("/api/auth/session", { credentials: "same-origin" });
  if (!response.ok) throw new Error("Editor sign-in is temporarily unavailable");
  const result = await response.json(); csrfToken = result.csrfToken || ""; return result.user;
}
export async function editorSignIn(username: string, password: string): Promise<EditorUser> {
  const result = await editorialRequest<{ user: EditorUser; csrfToken: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
  csrfToken = result.csrfToken; return result.user;
}
export async function editorSignOut() { await editorialRequest("/api/auth/logout", { method: "POST" }); csrfToken = ""; }
export async function editorialRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (csrfToken) headers.set("X-CSRF-Token", csrfToken);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, credentials: "same-origin", headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "The editorial request failed. Please try again.");
  return body as T;
}
