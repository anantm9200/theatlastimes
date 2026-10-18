import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ClientSession } from "mongodb";
import type { Article } from "../src/types";
import { analyzeArticle, aiConfiguration, type Analysis } from "../src/server/ai";
import { MongoNewsStore } from "../src/server/mongo-news-store";
import { MongoNewsJobs, NewsJobLeaseError, safeJobError, type NewsAnalysisJob } from "../src/server/news-jobs";
import { validateArticle } from "../src/server/news-validation";
import { configuredFeeds, ingestFeeds } from "../src/server/feeds";

export interface AnalysisJobStore {
  get(id: string, includeUnpublished: boolean): Promise<Article | undefined>;
  compareAndSave(article: Article, actor: string, revision: string, session?: ClientSession): Promise<Article | undefined>;
}
export type AnalysisQueue = Pick<MongoNewsJobs, "owns" | "heartbeat" | "supersede" | "fail" | "completeWith" | "leaseMs">;

/** Only inference is outside the transaction. Saving requires both revision and lease ownership. */
export async function processAnalysisJob(queue: AnalysisQueue, store: AnalysisJobStore, job: NewsAnalysisJob, analyze: (article: Article) => Promise<Analysis> = analyzeArticle): Promise<string> {
  let lostLease = false;
  let extending = false;
  const interval = setInterval(() => {
    if (extending) return;
    extending = true;
    queue.heartbeat(job).then(owned => { if (!owned) lostLease = true; }).catch(() => { lostLease = true; }).finally(() => { extending = false; });
  }, Math.max(1000, Math.floor(queue.leaseMs / 3)));
  interval.unref();
  try {
    const article = await store.get(job.articleId, true);
    if (!article || article.status !== "draft" || article.modifiedAt !== job.revision) {
      return await queue.supersede(job) ? "superseded" : "lease-lost";
    }
    if (!await queue.owns(job)) return "lease-lost";
    const analysis = await analyze(article);
    if (lostLease || !await queue.owns(job)) return "lease-lost";
    const model = process.env.AI_MODEL || process.env.GEMINI_MODEL || "configured-model";
    const updated = validateArticle({ ...analysis, status: "draft", aiGenerated: true, generatedBy: model, reviewNote: "", provenance: {
      sourceUrls: [...new Set([article.originalUrl, ...(article.provenance?.sourceUrls || [])].filter(Boolean))],
      retrievedAt: article.provenance?.retrievedAt || article.fetchedAt,
      model,
      promptVersion: "source-only-summary-v1",
    } }, article);
    return await queue.completeWith(job, session => store.compareAndSave(updated, `worker:${job.leaseOwner}`, job.revision, session));
  } catch (error) {
    if (lostLease || error instanceof NewsJobLeaseError) return "lease-lost";
    await queue.fail(job, error);
    return "retry-or-failed";
  } finally { clearInterval(interval); }
}

function integer(value: string | undefined, fallback: number, min: number, max: number, name: string): number {
  const result = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(result) || result < min || result > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return result;
}

export async function runDgxWorker(options: { once?: boolean } = {}): Promise<void> {
  if (!aiConfiguration().configured) throw new Error("Configure AI_PROVIDER and the local inference model before starting the worker");
  const leaseMs = integer(process.env.AI_JOB_LEASE_MS, 180_000, 30_000, 1_800_000, "AI_JOB_LEASE_MS");
  const attempts = integer(process.env.AI_JOB_MAX_ATTEMPTS, 3, 1, 10, "AI_JOB_MAX_ATTEMPTS");
  const pollMs = integer(process.env.DGX_WORKER_POLL_MS, 5000, 250, 60_000, "DGX_WORKER_POLL_MS");
  const concurrency = integer(process.env.DGX_WORKER_CONCURRENCY, 1, 1, 4, "DGX_WORKER_CONCURRENCY");
  const ingestionEnabled = process.env.ENABLE_INGESTION === "true";
  const feedPollMs = integer(process.env.FEED_POLL_MS, 30 * 60_000, 60_000, 24 * 60 * 60_000, "FEED_POLL_MS");
  if (ingestionEnabled) configuredFeeds();
  const store = new MongoNewsStore();
  const queue = new MongoNewsJobs(store.client, store.database, { leaseMs, maxAttempts: attempts });
  let stopping = false;
  let feedTimer: ReturnType<typeof setInterval> | undefined;
  let feedPass: Promise<void> | undefined;
  const runFeedPass = () => {
    if (stopping || feedPass) return feedPass;
    feedPass = ingestFeeds(store).then(result => {
      console.log(`Source collection: ${result.inserted} private drafts, ${result.skipped} skipped, ${result.errors.length} source errors.`);
    }).catch(error => { console.error(`Source collection failed: ${safeJobError(error)}`); }).finally(() => { feedPass = undefined; });
    return feedPass;
  };
  const waiting = new Set<() => void>();
  const stop = () => { stopping = true; if (feedTimer) clearInterval(feedTimer); for (const wake of waiting) wake(); };
  const wait = () => new Promise<void>(resolve => {
    const wake = () => { clearTimeout(timer); waiting.delete(wake); resolve(); };
    const timer = setTimeout(wake, pollMs);
    waiting.add(wake);
    if (stopping) wake();
  });
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    await store.initialize();
    await queue.ready();
    if (ingestionEnabled) {
      await runFeedPass();
      if (!options.once) { feedTimer = setInterval(() => { void runFeedPass(); }, feedPollMs); feedTimer.unref(); }
    }
    console.log(`DGX news worker ready; concurrency ${concurrency}. Reports remain drafts.`);
    const outcomes = await Promise.allSettled(Array.from({ length: concurrency }, async (_, slot) => {
      const owner = `${os.hostname()}:${process.pid}:${slot}:${crypto.randomUUID()}`;
      do {
        if (stopping) break;
        try {
          const job = await queue.claim(owner);
          if (job) {
            const outcome = await processAnalysisJob(queue, store, job);
            console.log(`Analysis job ${job.id}: ${outcome}`);
          } else if (!options.once) await wait();
        } catch (error) {
          console.error(`Worker polling failed: ${safeJobError(error)}`);
          if (options.once) throw error;
          await wait();
        }
      } while (!stopping && !options.once);
    }));
    const failed = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
    if (failed) throw failed.reason;
  } finally {
    stopping = true;
    if (feedTimer) clearInterval(feedTimer);
    await feedPass;
    for (const wake of waiting) wake();
    process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
    await store.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runDgxWorker({ once: process.argv.includes("--once") }).catch(error => { console.error(safeJobError(error)); process.exitCode = 1; });
}
