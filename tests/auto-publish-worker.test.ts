import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { MongoNewsStore } from "../src/server/mongo-news-store";
import { MongoNewsJobs } from "../src/server/news-jobs";
import { validateArticle } from "../src/server/news-validation";
import { processAnalysisJob } from "../scripts/dgx-worker";
import { publisherCatalog } from "../src/server/publishers";

test("only trusted feed jobs can pass automatic publication; failed checks preserve private drafts", { skip: !process.env.MONGODB_TEST_URI }, async () => {
  const keys = ["AUTO_PUBLISH", "AI_PROVIDER", "AI_BASE_URL", "AI_MODEL"], before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const source = "An international research team announces a shared telescope programme with laboratories in several countries. The report describes research cooperation and provides no launch date or attendance forecast.";
  const analysis = { keyPoints: ["The source describes an international telescope programme."], whyItMatters: "The source describes scientific cooperation.", detailedHumanizedSummary: source };
  let supported = true, calls = 0;
  const inference = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const prompt = JSON.parse(Buffer.concat(chunks).toString()), material = JSON.parse(prompt.messages[1].content);
    assert.equal(material.source.publisher, "Global Voices"); assert.ok(material.source.sourcePublishedAt);
    calls++; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ isGlobal: true, isNews: true, supported, category: "Science", evidence: [source], reason: "Checked the supplied material", imageSearch: "" }) } }] }));
  });
  await new Promise<void>(resolve => inference.listen(0, "127.0.0.1", resolve));
  process.env.AUTO_PUBLISH = "true"; process.env.AI_PROVIDER = "openai"; process.env.AI_MODEL = "test-local-model"; process.env.AI_BASE_URL = `http://127.0.0.1:${(inference.address() as AddressInfo).port}/v1`;
  const store = new MongoNewsStore(process.env.MONGODB_TEST_URI!, `atlas_auto_publish_${crypto.randomUUID().replaceAll("-", "")}`);
  try {
    await store.initialize(); await store.db.collection("news_publishers").insertOne(publisherCatalog[0] as any);
    const jobs = new MongoNewsJobs(store.client, store.db); await jobs.ready();
    for (const [name, requestedBy, passes] of [["trusted", "daily-ingestion", true], ["manual", "service:ingest", false], ["unsupported", "daily-ingestion", false]] as const) {
      supported = name !== "unsupported";
      const article = await store.save(validateArticle({ title: "International telescope programme", originalUrl: `https://globalvoices.org/${name}`, sourceName: "Global Voices", publisherId: "global-voices", sourceAuthor: "Test source author", sourcePublishedAt: new Date().toISOString(), summary: source }), "rss-ingestion");
      await jobs.enqueue(article, requestedBy); const job = await jobs.claim("isolated-test"); assert.ok(job);
      assert.equal(await processAnalysisJob(jobs, store, job, async () => analysis), "succeeded");
      const saved = await store.get(article.id, true); assert.equal(saved?.status, passes ? "published" : "draft");
      if (passes) { assert.equal(saved?.publicationMode, "automatic"); assert.equal(saved?.coverage, "global"); assert.equal(saved?.automationCheck?.verdict, "passed"); }
    }
    assert.equal(calls, 2); assert.equal(await store.count(), 1);
  } finally {
    await store.db.dropDatabase(); await store.close(); await new Promise<void>(resolve => inference.close(() => resolve()));
    for (const key of keys) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
  }
});
