import crypto from "node:crypto";
import { MongoClient, type ClientSession, type Collection, type Db } from "mongodb";
import type { Article } from "../types";

export type NewsJobStatus = "queued" | "running" | "succeeded" | "failed" | "superseded";
export interface NewsAnalysisJob {
  id: string;
  articleId: string;
  revision: string;
  status: NewsJobStatus;
  requestedBy: string;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  updatedAt: Date;
  availableAt: Date;
  finishedAt?: Date;
  leaseOwner?: string;
  leaseToken?: string;
  leaseUntil?: Date;
  lastError?: string;
  resultModifiedAt?: string;
}
type JobDocument = NewsAnalysisJob & { _id: string };
export class NewsJobLeaseError extends Error {
  constructor() { super("The analysis job lease was lost; no result was applied."); this.name = "NewsJobLeaseError"; }
}

export function analysisJobId(articleId: string, revision: string): string {
  return `analysis-${crypto.createHash("sha256").update(JSON.stringify([articleId, revision])).digest("hex")}`;
}
export function jobBackoffMs(attempt: number): number {
  return Math.min(15 * 60_000, 30_000 * 2 ** Math.min(10, Math.max(0, attempt - 1)));
}
export function safeJobError(error: unknown): string {
  return (error instanceof Error ? error.message : "Analysis failed")
    .replace(/(?:mongodb(?:\+srv)?|https?):\/\/[^\s)]+/gi, "[service URL]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/(?:api[_-]?key|token|password|secret)\s*[=:]\s*[^\s,;]+/gi, "credential=[redacted]")
    .slice(0, 700);
}

/** Durable MongoDB queue. Every completion and article write share one transaction. */
export class MongoNewsJobs {
  readonly collection: Collection<JobDocument>;
  readonly leaseMs: number;
  readonly maxAttempts: number;
  constructor(readonly client: MongoClient, readonly database: Db, options: { leaseMs?: number; maxAttempts?: number } = {}) {
    this.collection = database.collection<JobDocument>("news_analysis_jobs");
    this.leaseMs = options.leaseMs ?? 180_000;
    this.maxAttempts = options.maxAttempts ?? 3;
    if (!Number.isInteger(this.leaseMs) || this.leaseMs < 30_000 || this.leaseMs > 30 * 60_000) throw new Error("Job lease must be between 30000 and 1800000 milliseconds");
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1 || this.maxAttempts > 10) throw new Error("Job maximum attempts must be between 1 and 10");
  }
  async ready(): Promise<void> {
    await this.collection.createIndexes([
      { key: { articleId: 1, revision: 1 }, name: "one_analysis_per_revision", unique: true },
      { key: { status: 1, availableAt: 1, leaseUntil: 1, createdAt: 1 }, name: "claimable_analysis_jobs" },
    ]);
  }
  private external(document: JobDocument | null, includeLease = false): NewsAnalysisJob | undefined {
    if (!document) return undefined;
    const { _id: _unused, ...job } = document;
    if (includeLease) return job;
    const { leaseOwner: _owner, leaseToken: _token, leaseUntil: _until, ...visible } = job;
    return visible;
  }
  async get(id: string): Promise<NewsAnalysisJob | undefined> {
    if (!/^analysis-[a-f0-9]{64}$/.test(id)) return undefined;
    return this.external(await this.collection.findOne({ _id: id }));
  }
  async enqueue(article: Article, requestedBy: string): Promise<NewsAnalysisJob> {
    if (article.status !== "draft" || !article.modifiedAt || !Number.isFinite(Date.parse(article.modifiedAt))) throw new Error("Only a saved draft revision can be queued for analysis");
    const now = new Date();
    const id = analysisJobId(article.id, article.modifiedAt);
    const job: JobDocument = { _id: id, id, articleId: article.id, revision: article.modifiedAt, requestedBy: requestedBy.slice(0, 250), status: "queued", attempts: 0, maxAttempts: this.maxAttempts, createdAt: now, updatedAt: now, availableAt: now };
    try { await this.collection.updateOne({ _id: id }, { $setOnInsert: job }, { upsert: true }); }
    catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
    const saved = await this.collection.findOne({ _id: id });
    if (!saved) throw new Error("The analysis job could not be queued");
    return this.external(saved)!;
  }
  private owned(job: NewsAnalysisJob) {
    if (!job.leaseOwner || !job.leaseToken) throw new NewsJobLeaseError();
    return { _id: job.id, status: "running" as const, leaseOwner: job.leaseOwner, leaseToken: job.leaseToken, $expr: { $gt: ["$leaseUntil", "$$NOW"] } };
  }
  async claim(owner: string): Promise<NewsAnalysisJob | undefined> {
    if (!owner || owner.length > 250) throw new Error("A bounded worker identity is required");
    // An abandoned final attempt becomes terminal instead of remaining running forever.
    await this.collection.updateMany({ status: "running", $expr: { $and: [{ $lte: ["$leaseUntil", "$$NOW"] }, { $gte: ["$attempts", "$maxAttempts"] }] } }, [
      { $set: { status: "failed", updatedAt: "$$NOW", finishedAt: "$$NOW", lastError: "Worker lease expired after the maximum number of attempts" } },
      { $unset: ["leaseOwner", "leaseToken", "leaseUntil"] },
    ]);
    const document = await this.collection.findOneAndUpdate({ status: { $in: ["queued", "running"] }, $expr: { $and: [
      { $lt: ["$attempts", "$maxAttempts"] },
      { $or: [
        { $and: [{ $eq: ["$status", "queued"] }, { $lte: ["$availableAt", "$$NOW"] }] },
        { $and: [{ $eq: ["$status", "running"] }, { $lte: ["$leaseUntil", "$$NOW"] }] },
      ] },
    ] } }, [{ $set: { status: "running", leaseOwner: { $literal: owner }, leaseToken: crypto.randomUUID(), leaseUntil: { $add: ["$$NOW", this.leaseMs] }, updatedAt: "$$NOW", attempts: { $add: ["$attempts", 1] } } }], { sort: { availableAt: 1, createdAt: 1, id: 1 }, returnDocument: "after", includeResultMetadata: false });
    return this.external(document, true);
  }
  async heartbeat(job: NewsAnalysisJob): Promise<boolean> {
    const result = await this.collection.updateOne(this.owned(job), [{ $set: { leaseUntil: { $add: ["$$NOW", this.leaseMs] }, updatedAt: "$$NOW" } }]);
    return result.modifiedCount === 1;
  }
  async owns(job: NewsAnalysisJob): Promise<boolean> {
    return Boolean(await this.collection.findOne(this.owned(job), { projection: { _id: 1 } }));
  }
  async fail(job: NewsAnalysisJob, error: unknown): Promise<boolean> {
    const retry = job.attempts < job.maxAttempts;
    const result = await this.collection.updateOne(this.owned(job), [
      { $set: { status: retry ? "queued" : "failed", lastError: { $literal: safeJobError(error) }, updatedAt: "$$NOW", ...(retry ? { availableAt: { $add: ["$$NOW", jobBackoffMs(job.attempts)] } } : { finishedAt: "$$NOW" }) } },
      { $unset: ["leaseOwner", "leaseToken", "leaseUntil"] },
    ]);
    return result.modifiedCount === 1;
  }
  async supersede(job: NewsAnalysisJob): Promise<boolean> {
    const result = await this.collection.updateOne(this.owned(job), [{ $set: { status: "superseded", updatedAt: "$$NOW", finishedAt: "$$NOW" } }, { $unset: ["leaseOwner", "leaseToken", "leaseUntil"] }]);
    return result.modifiedCount === 1;
  }
  async completeWith(job: NewsAnalysisJob, save: (session: ClientSession) => Promise<Article | undefined>): Promise<"succeeded" | "superseded"> {
    return this.client.withSession(session => session.withTransaction(async () => {
      if (!await this.collection.findOne(this.owned(job), { session, projection: { _id: 1 } })) throw new NewsJobLeaseError();
      const article = await save(session);
      const status = article ? "succeeded" as const : "superseded" as const;
      const result = await this.collection.updateOne(this.owned(job), [
        { $set: { status, updatedAt: "$$NOW", finishedAt: "$$NOW", ...(article?.modifiedAt ? { resultModifiedAt: { $literal: article.modifiedAt } } : {}) } },
        { $unset: ["leaseOwner", "leaseToken", "leaseUntil", "lastError"] },
      ], { session });
      if (result.modifiedCount !== 1) throw new NewsJobLeaseError();
      return status;
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary", maxCommitTimeMS: 15000 })) as Promise<"succeeded" | "superseded">;
  }
}
