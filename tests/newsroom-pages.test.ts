import test from "node:test";
import assert from "node:assert/strict";
import { pageContent } from "../src/server/html";
import { NewsStore } from "../src/server/news-store";

test("all newsroom routes render indexable content without fabricated reports", async () => {
  const store = new NewsStore(":memory:");
  try {
    for (const page of ["/latest","/live","/analysis","/topics","/sources","/source/NOAA"]) {
      const result = await pageContent(page,store,"https://www.theatlastimes.com");
      assert.equal(result.status,200,page);
      assert.equal(result.noindex,false,page);
      assert.match(result.body,/<h1>/,page);
      assert.ok(result.structuredData,page);
    }
    const noBreaking = await pageContent("/live",store,"https://www.theatlastimes.com");
    assert.match(noBreaking.body,/No confirmed breaking news/);
  } finally { store.close(); }
});
test("topics and directory give readers real links", async () => {
  const store = new NewsStore(":memory:");
  try {
    const topics=await pageContent("/topics",store,"https://www.theatlastimes.com");
    assert.match(topics.body,/\/category\/climate/);
    assert.match(topics.body,/\/category\/sports/);
    const sources=await pageContent("/sources",store,"https://www.theatlastimes.com");
    assert.match(sources.body,/Source directory/);
  } finally {store.close();}
});
