import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { editorSession, editorSignIn, editorSignOut, type EditorUser } from "./editorialApi";
interface UserContextType {
  user: EditorUser | null; isEditor: boolean; loading: boolean; initialized: boolean; error: string;
  enableAuth: () => void; signIn: (username: string, password: string) => Promise<void>; signOut: () => Promise<void>;
}
const UserContext = createContext<UserContextType | null>(null);
export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<EditorUser | null>(null), [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false), [initialized, setInitialized] = useState(false), [error, setError] = useState("");
  const enableAuth = useCallback(() => setEnabled(true), []);
  useEffect(() => {
    if (!enabled) return;
    let active = true; setLoading(true);
    editorSession().then(user => { if (active) { setUser(user); setError(""); } })
      .catch(() => { if (active) setError("Editor sign-in is temporarily unavailable."); })
      .finally(() => { if (active) { setLoading(false); setInitialized(true); } });
    return () => { active = false; };
  }, [enabled]);
  const signIn = useCallback(async (username: string, password: string) => { setUser(await editorSignIn(username, password)); setError(""); }, []);
  const signOut = useCallback(async () => { await editorSignOut(); setUser(null); }, []);
  return <UserContext.Provider value={{ user, isEditor: Boolean(user), loading, initialized, error, enableAuth, signIn, signOut }}>{children}</UserContext.Provider>;
}
export function useAuth() { const context = useContext(UserContext); if (!context) throw new Error("useAuth requires UserProvider"); return context; }
