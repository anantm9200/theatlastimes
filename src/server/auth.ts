import crypto from "node:crypto";
import type { RequestHandler } from "express";

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
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) { res.status(401).json({ error: "Editorial authentication required" }); return; }
  const token = header.slice(7);
  if (matches(token, process.env.NEWS_API_KEY)) { res.locals.principal = { actor: "service:editor", role: "editor" }; next(); return; }
  if (matches(token, process.env.NEWS_INGEST_KEY)) { res.locals.principal = { actor: "service:ingest", role: "ingest" }; next(); return; }
  try {
    const { adminAuth } = await import("../lib/firebase-admin");
    const decoded = await adminAuth.verifyIdToken(token, true);
    if (decoded.editor !== true && decoded.admin !== true) { res.status(403).json({ error: "An editor role is required" }); return; }
    res.locals.principal = { actor: decoded.uid, role: "editor" };
    next();
  } catch { res.status(401).json({ error: "Invalid or expired editorial credentials" }); }
};

export const requireEditor: RequestHandler = (_req, res, next) => {
  if (res.locals.principal?.role !== "editor") { res.status(403).json({ error: "Only an editor can publish, update, export, or delete news" }); return; }
  next();
};
