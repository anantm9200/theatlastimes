export async function editorialRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { getFirebaseAuth } = await import("./firebase");
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Sign in with an editor account to continue.");
  const token = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "The editorial request failed. Please try again.");
  return body as T;
}
