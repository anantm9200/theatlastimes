import crypto from "node:crypto";
import type { RequestHandler } from "express";
import { constantEqual, sessionToken, type EditorSessions } from "./editor-sessions";

export type Principal = { actor: string; role: "editor" | "ingest" };
declare global { namespace Express { interface Locals { principal?: Principal } } }

function matches(value: string, expected?: string) {
  if (!expected || expected.length < 32) return false;
  const a = crypto.createHash("sha256").update(value).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export const requireNewsAuth: RequestHandler = async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : "";
  if (token && matches(token, process.env.NEWS_API_KEY)) { res.locals.principal = { actor: "service:editor", role: "editor" }; next(); return; }
  if (token && matches(token, process.env.NEWS_INGEST_KEY)) { res.locals.principal = { actor: "service:ingest", role: "ingest" }; next(); return; }
  try {
    const cookie = sessionToken(req), sessions = req.app.locals.editorSessions as EditorSessions | undefined;
    const username = cookie && sessions ? await sessions.verify(cookie) : undefined;
    if (!username || !cookie || !sessions) { res.status(401).json({ error: "Editorial authentication required" }); return; }
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !constantEqual(req.get("X-CSRF-Token") || "", sessions.csrf(cookie))) { res.status(403).json({ error: "Refresh your editor session before saving" }); return; }
    res.locals.principal = { actor: `editor:${username}`, role: "editor" }; next();
  } catch { res.status(401).json({ error: "Invalid or expired editorial credentials" }); }
};

export const requireEditor: RequestHandler = (_req, res, next) => {
  if (res.locals.principal?.role !== "editor") { res.status(403).json({ error: "Only an editor can publish, update, export, or delete news" }); return; }
  next();
};
