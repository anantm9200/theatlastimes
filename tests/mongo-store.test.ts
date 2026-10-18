import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { MongoNewsStore } from "../src/server/mongo-news-store.ts";
import { NewsConflictError } from "../src/server/store-types.ts";
import { validateArticle } from "../src/server/news-validation.ts";
import { createApp } from "../server.ts";
import { MongoNewsJobs } from "../src/server/news-jobs.ts";
import type { AddressInfo } from "node:net";
const uri = process.env.MONGODB_TEST_URI;

test("MongoDB configuration fails closed without an explicit URI", () => {
  assert.throws(() => new MongoNewsStore(""), /MONGODB_URI is required/);
  assert.throws(() => new MongoNewsStore("https://example.com"), /MongoDB connection/);
  assert.throws(() => new MongoNewsStore("mongodb://127.0.0.1:27017", "invalid/database"), /MONGODB_DB_NAME/);
});

test("MongoDB HTTP workflow keeps drafts private and queues DGX analysis before editorial publication", { skip: uri ? false : "Set MONGODB_TEST_URI to an isolated replica set to run MongoDB HTTP integration" }, async () => {
  const store = new MongoNewsStore(uri!, `atlas_test_http_${crypto.randomUUID().replaceAll("-", "")}`);
  await store.initialize();
  const jobs = new MongoNewsJobs(store.client, store.database);
  await jobs.ready();
  const previous = { editor: process.env.NEWS_API_KEY, ingest: process.env.NEWS_INGEST_KEY, execution: process.env.AI_EXECUTION };
  const editor = crypto.randomBytes(32).toString("hex"), ingest = crypto.randomBytes(32).toString("hex");
  process.env.NEWS_API_KEY = editor; process.env.NEWS_INGEST_KEY = ingest; process.env.AI_EXECUTION = "worker";
  const { app } = createApp(store, jobs);
  const server = await new Promise<import("node:http").Server>(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = async (route: string, method = "GET", body?: unknown, token?: string) => {
    const response = await fetch(base + route, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() as any };
  };
  try {
    const created = await request("/api/news", "POST", { title: "Isolated Mongo HTTP fixture", originalUrl: "https://source.example/http-fixture", summary: "The fixture contains source-linked test content." }, ingest);
    assert.equal(created.status, 201);
    const article = created.data.data;
    assert.equal((await request(`/api/news/${article.id}`)).status, 404);
    assert.equal((await request("/api/news")).data.data.length, 0);
    assert.equal((await request("/api/admin/news", "GET", undefined, ingest)).status, 403);
    const queued = await request(`/api/news/${article.id}/analyze`, "POST", undefined, ingest);
    assert.equal(queued.status, 202);
    assert.equal(queued.data.job.status, "queued");
    assert.equal((await jobs.get(queued.data.job.id))?.articleId, article.id);
    assert.equal((await request(`/api/news/${article.id}`, "PUT", { status: "published" }, ingest)).status, 403);
    const published = await request(`/api/news/${article.id}`, "PUT", { status: "published", authorName: "Isolated integration editor", reviewNote: "Reviewed test-only facts, attribution, and rights." }, editor);
    assert.equal(published.status, 200);
    assert.equal((await request(`/api/news/${article.id}`)).status, 200);
    assert.equal((await request("/api/news")).data.data.length, 1);
    assert.equal((await request(`/api/news/${article.id}`, "DELETE", undefined, editor)).status, 200);
    assert.equal(await store.count(), 0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await store.database.dropDatabase(); await store.close();
    for (const [key, value] of Object.entries({ NEWS_API_KEY: previous.editor, NEWS_INGEST_KEY: previous.ingest, AI_EXECUTION: previous.execution })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("MongoDB replica-set store: privacy, durable identity, transactions, CAS, aliases, and concurrency", { skip: uri ? false : "Set MONGODB_TEST_URI to an isolated replica set to run MongoDB integration tests" }, async t => {
  const databaseName = `atlas_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const store = new MongoNewsStore(uri!, databaseName);
  await store.initialize();
  t.after(async () => { await store.database.dropDatabase(); await store.close(); });
  let draft = await store.save(validateArticle({ title: "Mongo integration fixture", originalUrl: "https://source.example/mongo?utm_source=test", summary: "The supplied fixture states that a meeting is scheduled.", category: "Technology" }), "service:ingest");

  await t.test("drafts are private and a second client preserves canonical source identity", async () => {
    assert.equal(await store.get(draft.id), undefined);
    assert.equal(await store.count(), 0);
    assert.equal(await store.count("draft"), 1);
    assert.equal((await store.list()).length, 0);
    const second = new MongoNewsStore(uri!, databaseName);
    try {
      await second.initialize();
      const duplicate = await second.save(validateArticle({ title: "Updated source headline", originalUrl: "https://source.example/mongo#top", summary: draft.aiSummary, category: "Technology" }), "service:ingest");
      assert.equal(duplicate.id, draft.id);
      assert.equal(duplicate.slug, draft.slug);
      assert.equal(await second.count("draft"), 1);
      draft = duplicate;
    } finally { await second.close(); }
  });

  await t.test("publication, filtering, aliases, and archived states retain identity", async () => {
    const published = await store.save(validateArticle({ status: "published", authorName: "Test editor", reviewedAt: new Date().toISOString(), reviewNote: "Checked fixture facts and attribution." }, draft), "editor", draft.modifiedAt);
    assert.ok(published.publishedAt);
    assert.equal((await store.get(draft.slug))?.id, draft.id);
    await store.addAlias("old-news-identifier", draft.id);
    assert.equal((await store.get("old-news-identifier"))?.id, draft.id);
    assert.equal((await store.list({ category: "technology" })).length, 1);
    assert.equal((await store.list({ search: ".*" })).length, 0);
    assert.equal((await store.list({ search: "Updated" })).length, 1);
    const skipped = await store.save(validateArticle({ title: "Unreviewed overwrite", originalUrl: draft.originalUrl }), "service:ingest");
    assert.deepEqual(skipped, published);
    draft = await store.save(validateArticle({ status: "draft" }, published), "editor", published.modifiedAt);
    assert.equal(await store.get("old-news-identifier"), undefined);
  });

  await t.test("stale editor and inference results cannot overwrite a newer revision", async () => {
    const first = await store.get(draft.id, true);
    assert.ok(first);
    const edited = await store.save(validateArticle({ title: "Editor corrected the fixture" }, first), "editor", first.modifiedAt);
    assert.notEqual(edited.modifiedAt, first.modifiedAt);
    const stale = validateArticle({ whyItMatters: "Stale machine output" }, first);
    assert.equal(await store.compareAndSave(stale, "worker", first.modifiedAt!), undefined);
    await assert.rejects(store.save(stale, "editor", first.modifiedAt), NewsConflictError);
    assert.deepEqual(await store.get(draft.id, true), edited);
    const results = await Promise.allSettled([
      store.save(validateArticle({ title: "Concurrent update A" }, edited), "editor:a", edited.modifiedAt),
      store.save(validateArticle({ title: "Concurrent update B" }, edited), "editor:b", edited.modifiedAt),
    ]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(results.filter(result => result.status === "rejected" && result.reason instanceof NewsConflictError).length, 1);
    draft = (await store.get(draft.id, true))!;
  });

  await t.test("an aborted shared-session transaction leaves both content and audit unchanged", async () => {
    const previous = (await store.get(draft.id, true))!;
    const auditBefore = await store.audit();
    const session = store.client.startSession();
    try {
      await assert.rejects(session.withTransaction(async () => {
        assert.ok(await store.compareAndSave(validateArticle({ title: "Must roll back" }, previous), "worker", previous.modifiedAt!, session));
        throw new Error("Intentional integration-test rollback");
      }), /Intentional/);
    } finally { await session.endSession(); }
    assert.deepEqual(await store.get(draft.id, true), previous);
    assert.deepEqual(await store.audit(), auditBefore);
  });

  await t.test("concurrent source inserts produce one identity and deletion removes aliases atomically", async () => {
    const source = { title: "Concurrent new source", originalUrl: "https://source.example/concurrent", summary: "Test material" };
    await Promise.allSettled([store.save(validateArticle(source), "rss:a"), store.save(validateArticle(source), "rss:b")]);
    assert.equal((await store.list({ status: "all", search: "Concurrent new source" })).length, 1);
    const other = await store.save(validateArticle({ title: "Other editorial fixture" }), "editor");
    await assert.rejects(store.addAlias("old-news-identifier", other.id), NewsConflictError);
    assert.equal(await store.delete("old-news-identifier", "editor"), true);
    assert.equal(await store.get(draft.id, true), undefined);
    assert.equal(await store.get("old-news-identifier", true), undefined);
    assert.equal((await store.audit())[0].action, "delete");
    assert.equal(await store.delete(draft.id, "editor"), false);
  });
});
