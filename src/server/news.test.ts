import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { NewsStore } from "./news-store.ts";
import { ArticleValidationError, normalizeSourceUrl, validateArticle } from "./news-validation.ts";

test("untrusted article input is bounded, sanitized, and starts as an unpublished draft", () => {
  const draft = validateArticle({
    title: "<b>Source headline</b>",
    fullContent: '<p onclick="steal()">Verified excerpt</p><script>alert(1)</script><a href="javascript:steal()">Unsafe</a><iframe src="https://example.com"></iframe>',
    publishedAt: "2001-01-01T00:00:00.000Z", id: "attacker-id", slug: "attacker-slug",
  });
  assert.equal(draft.status, "draft");
  assert.equal(draft.publishedAt, "");
  assert.equal(draft.title, "Source headline");
  assert.match(draft.id, /^editorial-/);
  assert.notEqual(draft.slug, "attacker-slug");
  assert.equal(draft.fullContent, '<p>Verified excerpt</p><a>Unsafe</a>');
  assert.equal(draft.credibilityScore, 0);
  assert.equal(draft.imageCredit, undefined);
  for (const bad of [
    { title: "" }, { title: "x".repeat(301) }, { title: "Valid", tags: "Breaking" },
    { title: "Valid", imageUrl: "javascript:alert(1)" }, { title: "Valid", originalUrl: "https://user:password@example.com" },
    { title: "Valid", fullContent: "x".repeat(100_001) }, { title: "Valid", credibilityScore: 101 },
    { title: "Valid", sourcePublishedAt: "yesterday" }, { title: "Valid", aiGenerated: "false" },
    { title: "Valid", sourcePublishedAt: "2026-02-30T00:00:00Z" },
    { title: "Valid", status: "reviewed" }, { title: "Valid", ignored: "x".repeat(260_000) },
  ]) assert.throws(() => validateArticle(bad), ArticleValidationError);
});

test("source canonicalization produces durable IDs without removing meaningful query parameters", () => {
  const a = validateArticle({ title: "First version", originalUrl: "https://Example.COM/story?b=2&utm_source=rss&a=1#top" });
  const b = validateArticle({ title: "Updated headline", originalUrl: "https://example.com/story?a=1&b=2&fbclid=tracking" });
  const c = validateArticle({ title: "Another story", originalUrl: "https://example.com/story?a=2&b=2" });
  assert.equal(a.originalUrl, "https://example.com/story?a=1&b=2");
  assert.equal(a.id, b.id);
  assert.notEqual(a.id, c.id);
  assert.equal(normalizeSourceUrl(""), "");
});

test("draft publication sets a publication time and edits protect identity and publication time", () => {
  const draft = validateArticle({ title: "Initial headline", sourcePublishedAt: "2020-01-01T00:00:00Z" });
  const published = validateArticle({ status: "published", reviewedAt: new Date().toISOString(), authorName: "Editor" }, draft);
  assert.equal(published.sourcePublishedAt, "2020-01-01T00:00:00.000Z");
  assert.ok(Date.parse(published.publishedAt) > Date.parse(published.sourcePublishedAt));
  const edited = validateArticle({ title: "Corrected headline", id: "bad", slug: "bad", publishedAt: "1900-01-01T00:00:00Z", modifiedAt: "1900-01-01T00:00:00Z" }, published);
  assert.equal(edited.id, published.id);
  assert.equal(edited.slug, published.slug);
  assert.equal(edited.publishedAt, published.publishedAt);
  assert.ok(Date.parse(edited.modifiedAt!) >= Date.parse(published.modifiedAt!));
  assert.throws(() => validateArticle({ originalUrl: "https://other.example/story" }, published), /cannot be changed/);
  assert.equal(validateArticle({ status: "draft" }, published).status, "draft");
});

test("store persists drafts, deduplicates across restarts, publishes atomically, and backs up", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "atlas-store-"));
  const filename = path.join(dir, "news.db");
  let store = new NewsStore(filename);
  try {
    const draft = store.save(validateArticle({ title: "Source story", originalUrl: "https://example.com/news?utm_source=rss", aiSummary: "Source summary", category: "Technology" }), "rss");
    assert.equal(store.list().length, 0);
    assert.equal(store.count("draft"), 1);
    assert.equal(store.count(), 0);
    assert.equal(store.get(draft.id), undefined);
    assert.equal(store.get(draft.slug, true)?.id, draft.id);
    store.close();
    store = new NewsStore(filename);
    const duplicate = store.save(validateArticle({ title: "Updated source story", originalUrl: "https://example.com/news#top", category: "Technology" }), "rss");
    assert.equal(duplicate.id, draft.id);
    assert.equal(duplicate.slug, draft.slug);
    assert.equal(store.list({ status: "all" }).length, 1);
    const published = store.save(validateArticle({ status: "published", authorName: "News editor", reviewedAt: new Date().toISOString() }, duplicate), "editor");
    assert.equal(store.get(draft.slug)?.title, "Updated source story");
    assert.equal(store.count(), 1);
    assert.equal(store.list({ category: "technology" }).length, 1);
    assert.equal(store.list({ search: "%" }).length, 0);
    assert.equal(store.list({ search: "Updated" }).length, 1);
    assert.deepEqual(store.save(validateArticle({ title: "Unreviewed overwrite", originalUrl: "https://example.com/news" }), "rss"), published);
    assert.equal(store.audit().filter((event) => event.action === "create").length, 1);
    assert.equal(store.audit()[0].actor, "editor");
    const backupFile = path.join(dir, "backup.db");
    await store.backup(backupFile);
    const backup = new NewsStore(backupFile);
    assert.equal(backup.get(draft.id)?.status, "published");
    backup.close();
    const archived = store.save(validateArticle({ status: "archived" }, published), "editor");
    assert.equal(archived.status, "archived");
    assert.equal(store.get(draft.id), undefined);
    assert.equal(store.delete(draft.slug, "editor"), true);
    assert.equal(store.delete(draft.id, "editor"), false);
    assert.equal(store.audit()[0].action, "delete");
    assert.equal(store.list({ status: "all" }).length, 0);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
