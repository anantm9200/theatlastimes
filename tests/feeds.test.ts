import test from "node:test";
import assert from "node:assert/strict";
import { NewsStore } from "../src/server/news-store";
import { configuredFeeds, ingestFeeds } from "../src/server/feeds";

test("approved RSS sources retain attribution and dates, create private drafts, and deduplicate retries", async () => {
  process.env.FEED_URLS = '["https://source.example/rss"]';
  const store = new NewsStore(":memory:");
  const feed = async () => ({ title: "Actual source publisher", items: [
    { title: "Source report", link: "https://source.example/news?utm_source=feed", contentSnippet: "The supplied source excerpt.", isoDate: "2020-01-01T00:00:00.000Z" },
    { title: "Missing source link", contentSnippet: "Cannot publish this." },
    { title: "Unsafe link", link: "javascript:steal()", contentSnippet: "Cannot ingest this." },
  ] });
  try {
    const result = await ingestFeeds(store, feed);
    assert.equal(result.inserted, 1); assert.equal(result.skipped, 2); assert.deepEqual(result.errors, []);
    assert.equal(store.count(), 0); assert.equal(store.count("draft"), 1);
    const draft = store.list({ status: "draft" })[0];
    assert.equal(draft.sourceName, "Actual source publisher"); assert.equal(draft.sourcePublishedAt, "2020-01-01T00:00:00.000Z"); assert.equal(draft.publishedAt, ""); assert.equal(draft.fullContent, "<p>The supplied source excerpt.</p>"); assert.equal(draft.imageCredit, undefined);
    assert.equal((await ingestFeeds(store, feed)).inserted, 0);
    let attempts = 0;
    const failing = async () => { attempts++; throw new Error("Network failure"); };
    assert.equal((await ingestFeeds(store, failing)).errors.length, 1);
    assert.equal((await ingestFeeds(store, failing)).errors.length, 1); assert.equal(attempts, 2);
    process.env.FEED_URLS = '["http://insecure.example/rss"]'; assert.throws(() => configuredFeeds(), /HTTPS/);
  } finally { store.close(); delete process.env.FEED_URLS; }
});
