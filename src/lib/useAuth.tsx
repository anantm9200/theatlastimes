import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { User } from "firebase/auth";

interface UserContextType {
  user: User | null;
  isEditor: boolean;
  loading: boolean;
  initialized: boolean;
  error: string;
  enableAuth: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}
const UserContext = createContext<UserContextType | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isEditor, setIsEditor] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState("");
  const enableAuth = useCallback(() => setEnabled(true), []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    setLoading(true);
    Promise.all([import("./firebase"), import("firebase/auth")])
      .then(([client, firebase]) => {
        if (!active) return;
        unsubscribe = firebase.onIdTokenChanged(client.getFirebaseAuth(), async current => {
          try {
            const result = current ? await current.getIdTokenResult() : null;
            if (!active) return;
            setUser(current);
            setIsEditor(result?.claims.editor === true || result?.claims.admin === true);
            setError("");
          } catch {
            if (active) { setUser(null); setIsEditor(false); setError("Unable to verify your editor access. Sign in again."); }
          } finally {
            if (active) { setLoading(false); setInitialized(true); }
          }
        });
      })
      .catch(err => { if (active) { setError(err.message || "Editor sign-in is unavailable."); setInitialized(true); setLoading(false); } });
    return () => { active = false; unsubscribe?.(); };
  }, [enabled]);

  const signIn = useCallback(async (email: string, password: string) => {
    const [{ getFirebaseAuth }, { signInWithEmailAndPassword }] = await Promise.all([import("./firebase"), import("firebase/auth")]);
    const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
    const result = await credential.user.getIdTokenResult(true);
    setUser(credential.user);
    setIsEditor(result.claims.editor === true || result.claims.admin === true);
  }, []);
  const signOut = useCallback(async () => {
    const [{ getFirebaseAuth }, firebase] = await Promise.all([import("./firebase"), import("firebase/auth")]);
    await firebase.signOut(getFirebaseAuth());
    setUser(null); setIsEditor(false);
  }, []);

  return <UserContext.Provider value={{ user, isEditor, loading, initialized, error, enableAuth, signIn, signOut }}>{children}</UserContext.Provider>;
}

export function useAuth() {
  const value = useContext(UserContext);
  if (!value) throw new Error("useAuth requires UserProvider");
  return value;
}
