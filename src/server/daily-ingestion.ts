import crypto from "node:crypto";
import type { Db } from "mongodb";

export function ingestionDay(now = new Date(), timeZone = process.env.INGESTION_TIMEZONE || "Asia/Dubai", at = process.env.INGESTION_DAILY_AT || "06:00") {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(at)) throw new Error("INGESTION_DAILY_AT must be HH:mm");
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).map(part => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, due: `${parts.hour}:${parts.minute}` >= at, timeZone, at };
}
interface Run { _id: string; status: "pending" | "running" | "completed" | "failed"; attempts: number; owner?: string; leaseUntil?: Date; nextAttemptAt?: Date; result?: unknown; finishedAt?: Date }
export class DailyIngestion {
  constructor(private readonly db: Db) {}
  async run(collect: () => Promise<{ errors: string[] }>, now = new Date()) {
    const schedule = ingestionDay(now); if (!schedule.due) return false;
    const runs = this.db.collection<Run>("news_ingestion_runs"), id = `${schedule.timeZone}:${schedule.at}:${schedule.day}`, owner = crypto.randomUUID();
    try { await runs.insertOne({ _id: id, status: "pending", attempts: 0 }); } catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
    const run = await runs.findOneAndUpdate({ _id: id, $or: [{ status: "pending" }, { status: "running", leaseUntil: { $lt: now } }, { status: "failed", attempts: { $lt: 3 }, nextAttemptAt: { $lte: now } }] }, { $set: { owner, status: "running", leaseUntil: new Date(now.getTime() + 600000) }, $inc: { attempts: 1 } }, { returnDocument: "after" });
    if (!run) return false;
    const heartbeat = setInterval(() => { void runs.updateOne({ _id: id, owner, status: "running" }, { $set: { leaseUntil: new Date(Date.now() + 600000) } }).catch(() => {}); }, 60000); heartbeat.unref();
    try {
      const result = await collect();
      await runs.updateOne({ _id: id, owner, status: "running" }, { $set: { status: result.errors.length ? "failed" : "completed", result, finishedAt: new Date(), nextAttemptAt: new Date(Date.now() + 15 * 60000) } });
    } catch {
      await runs.updateOne({ _id: id, owner, status: "running" }, { $set: { status: "failed", result: { errors: ["Collection failed; see worker logs"] }, nextAttemptAt: new Date(Date.now() + 15 * 60000) } });
    } finally { clearInterval(heartbeat); }
    return true;
  }
}
