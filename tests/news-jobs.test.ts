import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { once } from "node:events";
import type { ClientSession } from "mongodb";
import type { Article } from "../src/types";
import type { Analysis } from "../src/server/ai";
import { analysisJobId, jobBackoffMs, MongoNewsJobs, NewsJobLeaseError, safeJobError, type NewsAnalysisJob } from "../src/server/news-jobs";
import { MongoNewsStore } from "../src/server/mongo-news-store";
import { validateArticle } from "../src/server/news-validation";
import { processAnalysisJob, runDgxWorker, type AnalysisQueue, type AnalysisJobStore } from "../scripts/dgx-worker";

const analysis: Analysis = { keyPoints: ["Only the supplied excerpt is available."], whyItMatters: "Interpretation: further reporting is required.", detailedHumanizedSummary: "The supplied material describes a test event. Its claims remain unverified." };
const draft = () => validateArticle({ title: "Isolated worker test", originalUrl: `https://example.com/${crypto.randomUUID()}`, summary: "This is an explicit test fixture, not live news.", fullContent: "<p>A source excerpt for a worker test.</p>", status: "draft" });
const leased = (article: Article): NewsAnalysisJob => ({ id: analysisJobId(article.id, article.modifiedAt!), articleId: article.id, revision: article.modifiedAt!, status: "running", attempts: 1, maxAttempts: 3, createdAt: new Date(), updatedAt: new Date(), availableAt: new Date(), leaseUntil: new Date(Date.now() + 180_000), leaseOwner: "test-worker", leaseToken: "fence-token", requestedBy: "test-editor" });
function fixture(article = draft()) {
  let current = article;
  let saves = 0;
  let owned = true;
  let failures = 0;
  let superseded = 0;
  const queue: AnalysisQueue = {
    leaseMs: 180_000,
    owns: async () => owned,
    heartbeat: async () => owned,
    supersede: async () => { superseded++; return owned; },
    fail: async () => { failures++; return owned; },
    completeWith: async (_job, callback) => { if (!owned) throw new NewsJobLeaseError(); return await callback({} as ClientSession) ? "succeeded" : "superseded"; },
  };
  const store: AnalysisJobStore = {
    get: async () => current,
    compareAndSave: async (next, _actor, revision) => {
      if (current.status !== "draft" || current.modifiedAt !== revision) return undefined;
      current = next; saves++; return next;
    },
  };
  return { queue, store, article, job: leased(article), state: () => ({ current, saves, failures, superseded }), change: (next: Article) => { current = next; }, loseLease: () => { owned = false; } };
}

test("analysis IDs bind the exact article revision and retry delay is bounded", () => {
  assert.equal(analysisJobId("article", "revision"), analysisJobId("article", "revision"));
  assert.notEqual(analysisJobId("article", "revision"), analysisJobId("article", "new-revision"));
  assert.notEqual(analysisJobId("a:b", "c"), analysisJobId("a", "b:c"));
  assert.equal(jobBackoffMs(1), 30_000);
  assert.equal(jobBackoffMs(2), 60_000);
  assert.equal(jobBackoffMs(30), 900_000);
  assert.equal(safeJobError(new Error("Failed https://private.example/path?token=secret Bearer credential")), "Failed [service URL] Bearer [redacted]");
});

test("worker applies generated text only to a draft and records source provenance", async () => {
  const f = fixture();
  const outcome = await processAnalysisJob(f.queue, f.store, f.job, async () => ({ ...analysis, status: "published" } as Analysis));
  assert.equal(outcome, "succeeded");
  const result = f.state();
  assert.equal(result.saves, 1);
  assert.equal(result.current.status, "draft");
  assert.equal(result.current.reviewedAt, undefined);
  assert.equal(result.current.aiGenerated, true);
  assert.deepEqual(result.current.provenance?.sourceUrls, [f.article.originalUrl]);
  assert.equal(result.current.provenance?.promptVersion, "source-only-summary-v1");
  assert.deepEqual(result.current.keyPoints, analysis.keyPoints);
});

test("stale or published work is superseded before inference starts", async () => {
  for (const change of [(article: Article) => ({ ...article, modifiedAt: "2099-01-01T00:00:00.000Z" }), (article: Article) => ({ ...article, status: "published" as const })]) {
    const f = fixture(); f.change(change(f.article));
    let calls = 0;
    assert.equal(await processAnalysisJob(f.queue, f.store, f.job, async () => { calls++; return analysis; }), "superseded");
    assert.equal(calls, 0); assert.equal(f.state().saves, 0); assert.equal(f.state().superseded, 1);
  }
});

test("edits during inference and lost leases cannot be overwritten", async () => {
  const changed = fixture();
  assert.equal(await processAnalysisJob(changed.queue, changed.store, changed.job, async () => { changed.change({ ...changed.article, title: "New editorial version", modifiedAt: "2099-01-01T00:00:00.000Z" }); return analysis; }), "superseded");
  assert.equal(changed.state().saves, 0);
  assert.equal(changed.state().current.title, "New editorial version");
  const lost = fixture();
  assert.equal(await processAnalysisJob(lost.queue, lost.store, lost.job, async () => { lost.loseLease(); return analysis; }), "lease-lost");
  assert.equal(lost.state().saves, 0);
});

test("model failures preserve the draft and enter bounded queue retry handling", async () => {
  const f = fixture();
  assert.equal(await processAnalysisJob(f.queue, f.store, f.job, async () => { throw new Error("Inference service returned HTTP 503"); }), "retry-or-failed");
  assert.equal(f.state().saves, 0); assert.equal(f.state().failures, 1);
  assert.deepEqual(f.state().current, f.article);
});

const mongoUri = process.env.MONGODB_TEST_URI;
test("Mongo queue provides exclusive claims, lease fencing, atomic rollback and revision checks", { skip: !mongoUri }, async () => {
  const name = `atlas_jobs_test_${crypto.randomUUID().replace(/-/g, "")}`;
  const store = new MongoNewsStore(mongoUri!, name);
  try {
    await store.initialize();
    const queue = new MongoNewsJobs(store.client, store.database, { leaseMs: 30_000 });
    await queue.ready();
    const article = await store.save(draft(), "test:fixture");
    const enqueued = await Promise.all([queue.enqueue(article, "test-editor"), queue.enqueue(article, "test-editor")]);
    assert.equal(enqueued[0].id, enqueued[1].id);
    const claims = await Promise.all([queue.claim("worker-a"), queue.claim("worker-b")]);
    assert.equal(claims.filter(Boolean).length, 1);
    const first = claims.find(Boolean)!;
    assert.equal(first.attempts, 1);
    const candidate = validateArticle({ ...analysis, status: "draft" }, article);
    await assert.rejects(queue.completeWith(first, async session => { await store.compareAndSave(candidate, "worker:test", first.revision, session); throw new Error("Abort the transaction"); }), /Abort the transaction/);
    assert.equal((await store.get(article.id, true))?.modifiedAt, article.modifiedAt);
    assert.equal((await queue.get(first.id))?.status, "running");
    await queue.collection.updateOne({ _id: first.id }, { $set: { leaseUntil: new Date(0) } });
    const reclaimed = (await queue.claim("worker-recovered"))!;
    assert.equal(reclaimed.id, first.id); assert.equal(reclaimed.attempts, 2);
    assert.notEqual(reclaimed.leaseToken, first.leaseToken);
    assert.equal(await queue.owns(first), false);
    assert.equal(await queue.heartbeat(first), false);
    await assert.rejects(queue.completeWith(first, async () => candidate), NewsJobLeaseError);
    assert.equal(await processAnalysisJob(queue, store, reclaimed, async () => analysis), "succeeded");
    const done = (await queue.get(first.id))!;
    assert.equal(done.status, "succeeded");
    assert.equal(done.leaseToken, undefined);
    const generated = (await store.get(article.id, true))!;
    assert.equal(generated.status, "draft"); assert.equal(generated.aiGenerated, true);
    assert.equal(await store.count(), 0);
    assert.equal((await queue.enqueue(article, "test-editor")).status, "succeeded");

    const stale = await queue.enqueue(generated, "test-editor");
    const staleClaim = (await queue.claim("worker-stale"))!;
    const edited = await store.save(validateArticle({ title: "Editor changed the source draft" }, generated), "test-editor", generated.modifiedAt);
    assert.equal(await processAnalysisJob(queue, store, staleClaim, async () => { throw new Error("Must not infer"); }), "superseded");
    assert.equal((await queue.get(stale.id))?.status, "superseded");
    assert.equal((await store.get(article.id, true))?.title, edited.title);

    const lastTry = new MongoNewsJobs(store.client, store.database, { leaseMs: 30_000, maxAttempts: 1 });
    const finalJob = await lastTry.enqueue(edited, "test-editor");
    const finalClaim = (await lastTry.claim("worker-crashed"))!;
    assert.equal(finalClaim.id, finalJob.id);
    await lastTry.collection.updateOne({ _id: finalClaim.id }, { $set: { leaseUntil: new Date(0) } });
    assert.equal(await lastTry.claim("worker-reaper"), undefined);
    assert.equal((await lastTry.get(finalJob.id))?.status, "failed");

    const retryArticle = await store.save(validateArticle({ title: "Retry test revision" }, edited), "test-editor", edited.modifiedAt);
    const retryQueue = new MongoNewsJobs(store.client, store.database, { leaseMs: 30_000, maxAttempts: 2 });
    const retryJob = await retryQueue.enqueue(retryArticle, "test-editor");
    const attemptOne = (await retryQueue.claim("worker-retry"))!;
    assert.equal(attemptOne.id, retryJob.id);
    assert.equal(await retryQueue.fail(attemptOne, new Error("Inference service returned HTTP 503")), true);
    assert.equal((await retryQueue.get(retryJob.id))?.status, "queued");
    assert.ok((await retryQueue.get(retryJob.id))!.availableAt.getTime() > Date.now());
    assert.equal(await retryQueue.claim("worker-too-soon"), undefined);
    await retryQueue.collection.updateOne({ _id: retryJob.id }, { $set: { availableAt: new Date(0) } });
    const attemptTwo = (await retryQueue.claim("worker-final-retry"))!;
    assert.equal(attemptTwo.attempts, 2);
    assert.equal(await retryQueue.fail(attemptTwo, new Error("Inference service returned HTTP 503")), true);
    assert.equal((await retryQueue.get(retryJob.id))?.status, "failed");
    assert.equal(await retryQueue.claim("worker-exhausted"), undefined);
  } finally {
    await store.database.dropDatabase();
    await store.close();
  }
});


test("one-shot worker consumes a Mongo job through an OpenAI-compatible service and exits", { skip: !mongoUri }, async () => {
  const name = `atlas_worker_test_${crypto.randomUUID().replace(/-/g, "")}`;
  const store = new MongoNewsStore(mongoUri!, name);
  const keys = ["MONGODB_URI", "MONGODB_DB_NAME", "AI_PROVIDER", "AI_BASE_URL", "AI_MODEL", "AI_API_KEY", "AI_DISABLE_THINKING", "AI_JSON_MODE", "ENABLE_INGESTION", "DGX_WORKER_CONCURRENCY"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  let inferenceCalls = 0;
  const server = http.createServer(async (request, response) => {
    const parts = []; for await (const part of request) parts.push(part);
    const body = JSON.parse(Buffer.concat(parts).toString());
    assert.equal(request.url, "/v1/chat/completions");
    assert.equal(body.model, "test-model");
    assert.match(body.messages[0].content, /unreviewed editorial drafts/);
    inferenceCalls++;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(analysis) } }] }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    await store.initialize();
    const article = await store.save(draft(), "test:fixture");
    const queue = new MongoNewsJobs(store.client, store.database); await queue.ready();
    const job = await queue.enqueue(article, "test-editor");
    Object.assign(process.env, { MONGODB_URI: mongoUri, MONGODB_DB_NAME: name, AI_PROVIDER: "openai", AI_BASE_URL: `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/v1`, AI_MODEL: "test-model", AI_API_KEY: "", AI_DISABLE_THINKING: "false", AI_JSON_MODE: "false", ENABLE_INGESTION: "false", DGX_WORKER_CONCURRENCY: "1" });
    await runDgxWorker({ once: true });
    assert.equal(inferenceCalls, 1);
    assert.equal((await queue.get(job.id))?.status, "succeeded");
    const result = (await store.get(article.id, true))!;
    assert.equal(result.status, "draft"); assert.equal(result.generatedBy, "test-model");
    assert.equal(result.provenance?.model, "test-model");
    assert.equal(await store.count(), 0);
  } finally {
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await store.database.dropDatabase(); await store.close();
  }
});
