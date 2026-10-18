import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { MongoClient } from "mongodb";
import { ingestionDay, DailyIngestion } from "../src/server/daily-ingestion";
import { publicationHold, type PublicationCheck } from "../src/server/auto-publication";
import { publisherCatalog, publicImages } from "../src/server/publishers";
import { publisherImage, selectNewsImage } from "../src/server/news-images";
import { validateArticle } from "../src/server/news-validation";
import { ingestFeeds } from "../src/server/feeds";
import { NewsStore } from "../src/server/news-store";

const excerpt = "An international research team announces a shared space telescope programme that includes laboratories in several countries. The source describes scientific cooperation and provides no launch date.";
const publisher = { ...publisherCatalog[0], imageHosts: ["photos.example"], imagePermission: "Recorded test permission", imagesEnabled: true };
const article = () => validateArticle({ title: "International telescope programme", originalUrl: "https://globalvoices.org/test", publisherId: publisher._id, sourceName: publisher.name, sourceAuthor: "Source author", sourcePublishedAt: new Date().toISOString(), summary: excerpt });
const analysis = { keyPoints: ["An international team describes telescope cooperation."], detailedHumanizedSummary: excerpt, whyItMatters: "The source describes international scientific cooperation." };
const check: PublicationCheck = { isGlobal: true, isNews: true, supported: true, category: "Science", evidence: [excerpt], reason: "Supported by the supplied source", imageSearch: "space telescope" };

test("daily ingestion uses Dubai wall time and catches up only after the scheduled hour", () => {
  assert.equal(ingestionDay(new Date("2026-10-18T01:59:00Z"), "Asia/Dubai", "06:00").due, false);
  assert.deepEqual(ingestionDay(new Date("2026-10-18T02:00:00Z"), "Asia/Dubai", "06:00"), { day: "2026-10-18", due: true, timeZone: "Asia/Dubai", at: "06:00" });
  assert.throws(() => ingestionDay(new Date(), "Asia/Dubai", "25:00"));
});
test("automatic publication holds stale, local, unlicensed and unsupported drafts", () => {
  const draft = article();
  assert.equal(publicationHold(draft, analysis, publisher, check), undefined);
  assert.match(publicationHold(draft, analysis, { ...publisher, textAllowed: false }, check)!, /not approved/);
  assert.match(publicationHold({ ...draft, sourcePublishedAt: "2020-01-01T00:00:00Z" }, analysis, publisher, check)!, /stale/);
  assert.match(publicationHold(draft, analysis, publisher, { ...check, isGlobal: false })!, /local/);
  assert.match(publicationHold(draft, analysis, publisher, { ...check, evidence: ["A fabricated quotation that never appeared in the source material."] })!, /Evidence/);
  assert.match(publicationHold(draft, { ...analysis, keyPoints: ["There will be 999 attendees."] }, publisher, check)!, /number/);
  assert.match(publicationHold({ ...draft, sourceAuthor: "" }, analysis, publisher, check)!, /author/);
  assert.equal(publicationHold(draft, { ...analysis, keyPoints: [`The source date is ${draft.sourcePublishedAt!.slice(0, 4)}.`] }, publisher, check), undefined);
  assert.equal(publicationHold(draft, analysis, publisher, { ...check, evidence: [excerpt.replaceAll(" ", "  ")] }), undefined);
  assert.match(publicationHold({ ...draft, fullContent: `<p>${excerpt} […]</p>` }, analysis, publisher, check)!, /incomplete/);
  assert.match(publicationHold({ ...draft, title: "APOD: Today's picture" }, analysis, publisher, check)!, /photo feature/);
  assert.match(publicationHold(draft, analysis, publisher, { ...check, reason: "The context is a reasonable inference, though slightly extrapolated." })!, /inferred or unsupported/);
});
test("free photos take priority and publisher photos require permission, a host match and the real credit", async () => {
  const draft = { ...article(), publisherImageUrl: "https://photos.example/original.jpg", publisherImageCredit: "Photographer / Agency" };
  const free = { imageUrl: "https://upload.wikimedia.org/free.jpg", imageType: "free", imageCredit: "Creator", imageLicense: "CC BY 4.0" };
  assert.deepEqual(await selectNewsImage(draft, publisher, "telescope", async () => free), free);
  assert.equal((await selectNewsImage(draft, publisher, "telescope", async () => undefined)).imageUrl, draft.publisherImageUrl);
  assert.equal(publisherImage(draft, { ...publisher, imagesEnabled: false }), undefined);
  assert.equal(publisherImage({ ...draft, publisherImageCredit: "" }, publisher), undefined);
  assert.equal(publisherImage({ ...draft, publisherImageUrl: "https://unapproved.example/x.jpg" }, publisher), undefined);
});
test("a pushed draft cannot gain trusted feed status by claiming a publisher ID", async () => {
  const store = new NewsStore(":memory:"); let queued = 0;
  const source = article(); store.save({ ...source, aiSummary: "A made-up summary", fullContent: "<p>Invented material.</p>" });
  try {
    await ingestFeeds(store, async () => ({ items: [{ title: source.title, link: source.originalUrl, contentSnippet: excerpt, creator: source.sourceAuthor, isoDate: source.sourcePublishedAt }] }), { publishers: [publisher], onDraft: async () => { queued++; } });
    assert.equal(queued, 0);
  } finally { store.close(); }
});
test("fresh source text upgrades an unchanged legacy feed excerpt without importing images or markup", async () => {
  const store = new NewsStore(":memory:"); const source = article();
  const old = validateArticle({ ...source, sourceUrl: publisher.feedUrl, textLicense: publisher.textLicense, textLicenseUrl: "https://creativecommons.org/licenses/by/3.0/", publisherImageCredit: "", tags: ["Source excerpt"], aiGenerated: true, automationCheck: { verdict: "held", reason: "Incomplete excerpt", checkedAt: new Date().toISOString(), version: "source-grounded-global-v2" } });
  store.save(old); let queued = 0;
  try {
    await ingestFeeds(store, async () => ({ items: [{ title: source.title, link: source.originalUrl, contentSnippet: excerpt, "content:encoded": `<p>${excerpt}</p><p>The full source supplies further details.</p><img src="https://publisher.example/photo.jpg">`, creator: source.sourceAuthor, isoDate: source.sourcePublishedAt }] }), { publishers: [publisher], onDraft: async updated => { queued++; assert.match(updated.fullContent!, /further details/); assert.doesNotMatch(updated.fullContent!, /<img|publisher.example/); } });
    assert.equal(queued, 1);
  } finally { store.close(); }
});
test("a daily Mongo lease prevents duplicate runs across workers and restarts; the image switch applies at read time", { skip: !process.env.MONGODB_TEST_URI }, async () => {
  const client = new MongoClient(process.env.MONGODB_TEST_URI!), db = client.db(`atlas_automation_${crypto.randomUUID().replaceAll("-", "")}`);
  try {
    const now = new Date("2026-10-18T08:00:00Z"); let calls = 0;
    const collect = async () => { calls++; return { errors: [] }; };
    await Promise.all([new DailyIngestion(db).run(collect, now), new DailyIngestion(db).run(collect, now)]);
    await new DailyIngestion(db).run(collect, now); assert.equal(calls, 1);
    const photo = { ...article(), imageType: "publisher", imageUrl: "https://photos.example/original.jpg", imageCredit: "Photographer" };
    await db.collection("news_publishers").insertOne(publisher as any);
    assert.equal((await publicImages(db, [photo]))[0].imageUrl, photo.imageUrl);
    await db.collection("news_publishers").updateOne({ _id: publisher._id } as any, { $set: { imagesEnabled: false } });
    assert.equal((await publicImages(db, [photo]))[0].imageUrl, undefined);
  } finally { await db.dropDatabase(); await client.close(); }
});
