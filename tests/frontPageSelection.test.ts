import test from "node:test";
import assert from "node:assert/strict";
import { diversifyReports, frontPageSelection, isConfirmedBreaking, NEWS_DESKS } from "../src/lib/frontPageSelection";
import type { Article } from "../src/types";
const now = Date.parse("2026-11-08T12:00:00Z");
const article = (id: string, changes: Partial<Article> = {}): Article => ({
  id, slug:id, title:id, sourceName:"NASA", originalUrl:"https://example.org/"+id, sourceUrl:"https://example.org/feed",
  publishedAt:new Date(now-3_600_000).toISOString(), sourcePublishedAt:new Date(now-4_000_000).toISOString(),
  reviewedAt:new Date(now-3_000_000).toISOString(), fetchedAt:new Date(now-3_000_000).toISOString(),
  category:"Science", region:"Global", language:"en", tags:["Source excerpt"], status:"published",
  publicationMode:"automatic", importanceScore:0, relevanceScore:0, credibilityScore:0, ...changes,
} as Article);
test("breaking requires editorial flag, human review and a genuinely recent source", () => {
  assert.equal(isConfirmedBreaking(article("auto", { tags:["Breaking"] }), now), false);
  assert.equal(isConfirmedBreaking(article("old", { tags:["Breaking"], publicationMode:"human", sourcePublishedAt:"2026-11-01T10:00:00Z" }), now), false);
  assert.equal(isConfirmedBreaking(article("verified", { tags:["Breaking"], publicationMode:"human" }), now), true);
  assert.equal(isConfirmedBreaking(article("draft", { tags:["Breaking"], publicationMode:"human", status:"draft" }), now), false);
});
test("front page never labels newest automatically published article as breaking", () => {
  const result=frontPageSelection([article("nasa")],now);
  assert.equal(result.hero?.id,"nasa");
  assert.equal(result.breaking.length,0);
  assert.equal(result.total,1);
});
test("lead breaking is shown only after explicit editorial review", () => {
 const result=frontPageSelection([article("nasa"),article("emergency",{tags:["Breaking"],publicationMode:"human",category:"World",sourceName:"Editorial desk"})],now);
 assert.equal(result.hero?.id,"emergency");
 assert.equal(result.breaking.length,1);
});
test("latest desk diversifies sources before repeating NASA", () => {
 const results=diversifyReports([
 article("nasa-1"),article("nasa-2"),
 article("global",{sourceName:"Global Voices",category:"World"}),
 article("sec",{sourceName:"SEC",category:"Business"}),
 ],3);
 assert.deepEqual(results.map(a=>a.id),["nasa-1","global","sec"]);
});
test("all nine newsroom desks exist",()=>assert.equal(NEWS_DESKS.length,9));
