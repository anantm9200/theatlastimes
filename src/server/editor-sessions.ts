import crypto from "node:crypto";
import type { Db } from "mongodb";
import type { Request, Response } from "express";

export const cookieName = () => process.env.NODE_ENV === "production" ? "__Host-atlas_editor" : "atlas_editor";
const digest = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
export function constantEqual(a: string, b: string) { return crypto.timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b))); }
export async function passwordHash(password: string, salt = crypto.randomBytes(16).toString("hex")) {
  if (password.length < 16 || password.length > 256) throw new Error("Use a password between 16 and 256 characters");
  const hash = await new Promise<Buffer>((resolve, reject) => crypto.scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, result) => error ? reject(error) : resolve(result)));
  return `scrypt$${salt}$${hash.toString("hex")}`;
}
export function sessionToken(req: Request): string | undefined {
  const raw = req.headers.cookie?.split(";").map(part => part.trim()).find(part => part.startsWith(`${cookieName()}=`))?.slice(cookieName().length + 1);
  return raw && /^[a-f0-9]{64}$/.test(raw) ? raw : undefined;
}
export function writeSessionCookie(res: Response, token: string, expires: Date) {
  res.cookie(cookieName(), token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", expires });
}
export class EditorSessions {
  private ready?: Promise<unknown>;
  constructor(private readonly db: Db) {}
  private collection() {
    const collection = this.db.collection<{ _id: string; username: string; generation: string; expiresAt: Date }>("editor_sessions");
    this.ready ||= collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    return collection;
  }
  csrf(token: string) { return crypto.createHmac("sha256", process.env.EDITOR_PASSWORD_HASH || "disabled").update(token).digest("hex"); }
  async login(username: string, password: string) {
    const configured = process.env.EDITOR_PASSWORD_HASH || "";
    const [scheme, salt, expected] = configured.split("$");
    if (!process.env.EDITOR_USERNAME || scheme !== "scrypt" || !/^[a-f0-9]{32}$/.test(salt || "") || !/^[a-f0-9]{128}$/.test(expected || "")) return undefined;
    const computed = await passwordHash(password, salt).catch(() => "invalid");
    if (!constantEqual(computed, configured) || !constantEqual(username.toLowerCase(), process.env.EDITOR_USERNAME.toLowerCase())) return undefined;
    const token = crypto.randomBytes(32).toString("hex"), expiresAt = new Date(Date.now() + 8 * 3600000);
    const collection = this.collection(); await this.ready;
    await collection.insertOne({ _id: digest(token), username: process.env.EDITOR_USERNAME, generation: digest(configured), expiresAt });
    return { token, expiresAt, username: process.env.EDITOR_USERNAME, csrfToken: this.csrf(token) };
  }
  async verify(token: string) {
    const collection = this.collection(); await this.ready;
    const session = await collection.findOne({ _id: digest(token), generation: digest(process.env.EDITOR_PASSWORD_HASH || ""), expiresAt: { $gt: new Date() } });
    return session?.username;
  }
  async revoke(token: string) { await this.collection().deleteOne({ _id: digest(token) }); }
}
