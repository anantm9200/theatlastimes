import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/useAuth";
import SeoHead from "../lib/SeoHead";

export default function EditorialGate({ children }: { children: ReactNode }) {
  const { user, isEditor, loading, initialized, error, enableAuth, signIn, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(enableAuth, [enableAuth]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSubmitting(true); setMessage("");
    try { await signIn(email, password); }
    catch { setMessage("Sign-in failed. Check your email and password, or contact the site operator."); }
    finally { setPassword(""); setSubmitting(false); }
  };
  if (!initialized || loading) return <><SeoHead title="Editor sign-in" noindex /><div role="status" className="py-20 text-center">Checking editor access…</div></>;
  if (user && isEditor) return <>
    <SeoHead title="Editorial desk" noindex />
    <div className="flex flex-wrap gap-4 items-center justify-between border-b border-border py-4 text-sm">
      <Link to="/editorial" className="font-bold underline">Editorial desk</Link>
      <span>{user.username}</span>
      <button onClick={() => { signOut().catch(() => setMessage("Sign-out failed. Try again.")); }} className="underline">Sign out</button>
    </div>
    {message && <p role="alert">{message}</p>}
    {children}
  </>;
  return <div className="max-w-md mx-auto py-14 px-4 space-y-6">
    <SeoHead title="Editor sign-in" noindex />
    <h1 className="font-serif text-3xl font-bold">Editor sign-in</h1>
    {error && <p role="alert">{error}</p>}
    {user ? <><p>Your account does not have editor access. Ask the site operator to grant the editor role, then sign in again.</p><button className="underline" onClick={() => { signOut().catch(() => setMessage("Sign-out failed. Try again.")); }}>Sign out</button></> : <form onSubmit={submit} className="space-y-5">
      <label className="block">Editor username<input autoComplete="username" type="text" required value={email} onChange={event => setEmail(event.target.value)} className="block w-full border p-3 mt-2" /></label>
      <label className="block">Password<input autoComplete="current-password" type="password" required value={password} onChange={event => setPassword(event.target.value)} className="block w-full border p-3 mt-2" /></label>
      <button disabled={submitting} className="bg-foreground text-background px-6 py-3 font-bold disabled:opacity-50">{submitting ? "Signing in…" : "Sign in"}</button>
    </form>}
    {message && <p role="alert">{message}</p>}
    <Link to="/" className="block underline">Return to the news</Link>
  </div>;
}
