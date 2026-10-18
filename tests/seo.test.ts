import test from "node:test";
import assert from "node:assert/strict";
import type { Article } from "../src/types";
import { articleStructuredData, serializeJsonLd, safeExternalUrl, collectionStructuredData } from "../src/lib/seo";

const article: Article = {
  id: "article-source-id", slug: "rewritten-headline", title: "A source-linked report", sourceName: "Original Publisher", sourceUrl: "https://source.example/", originalUrl: "https://source.example/report", publishedAt: "2026-10-17T12:00:00Z", sourcePublishedAt: "2026-10-16T12:00:00Z", modifiedAt: "2026-10-17T13:00:00Z", fetchedAt: "2026-10-17T11:00:00Z", authorName: "A Reporter", category: "World", region: "Global", language: "en", tags: [], aiSummary: "A factual summary.", importanceScore: 0, credibilityScore: 0, relevanceScore: 0,
};

test("embedded JSON-LD cannot terminate its script and preserves source text", () => {
  const input = { title: '</script><script>alert("x")</script> & <text>' };
  const result = serializeJsonLd(input);
  assert.equal(result.includes("<"), false);
  assert.equal(result.includes("&"), false);
  assert.deepEqual(JSON.parse(result), input);
});

test("article schema separates source time, publication and modification", () => {
  const schema = articleStructuredData(article, "https://news.example");
  assert.equal(schema.datePublished, "2026-10-17T12:00:00.000Z");
  assert.equal(schema.dateModified, "2026-10-17T13:00:00.000Z");
  assert.equal(schema.citation?.datePublished, "2026-10-16T12:00:00.000Z");
  assert.equal(schema.author?.name, "A Reporter");
  assert.equal(schema.url, "https://news.example/article/article-source-id");
});

test("unsupported provenance is omitted rather than fabricated", () => {
  const schema = articleStructuredData({ ...article, authorName: undefined, sourcePublishedAt: undefined, modifiedAt: "not-a-date", imageUrl: "https://picsum.photos/seed/test/800/450" }, "https://news.example");
  assert.equal("author" in schema, false);
  assert.equal("image" in schema, false);
  assert.equal("dateModified" in schema, false);
  assert.equal("datePublished" in schema.citation!, false);
  assert.equal(safeExternalUrl("javascript:alert(1)"), undefined);
  assert.equal(safeExternalUrl("#"), undefined);
});

test("discovery links use resolvable stable IDs instead of unimplemented slugs", () => {
  const schema = collectionStructuredData("News", "/archives", [article], "https://news.example");
  assert.equal(schema.mainEntity.itemListElement[0].url, "https://news.example/article/article-source-id");
  assert.equal(schema.mainEntity.itemListElement[0].position, 1);
});
