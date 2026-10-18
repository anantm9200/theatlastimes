import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });
import fs from "node:fs/promises";
import { createConfiguredStore } from "../src/server/store";
import { validateArticle } from "../src/server/news-validation";
const filename = process.argv[2];
if (!filename) throw new Error("Usage: npm run news:import -- /secure/path/legacy-articles.json");
const input = JSON.parse(await fs.readFile(filename, "utf8"));
const rows = Array.isArray(input) ? input : input.data;
if (!Array.isArray(rows)) throw new Error("Input must contain an array of articles or {data: [...articles]}");
const store = await createConfiguredStore();
let imported = 0, skipped = 0, failed = 0;
try {
  for (const row of rows) {
    try {
      const old = typeof row.rawMetadata === "string" ? { ...row, ...JSON.parse(row.rawMetadata) } : row;
      const draft = validateArticle({ ...old, title: old.title || old.originalTitle, originalUrl: old.originalUrl === "#" ? "" : old.originalUrl,
        sourceUrl: old.sourceUrl === "#" ? "" : old.sourceUrl,
        sourcePublishedAt: old.sourcePublishedAt || old.publishedAt || old.originalPublishedAt || undefined,
        summary: old.aiSummary || old.excerpt, imageUrl: "", imageCredit: "", imageLicense: "", imageSource: "", imageCaption: "", status: "draft", reviewedAt: undefined, reviewNote: "", credibilityScore: 0, importanceScore: 0, relevanceScore: 0 });
      // A legacy alias makes this operation idempotent for editorial UUID records too.
      const existing = (typeof old.id === "string" ? await store.get(old.id, true) : undefined) || await store.get(draft.id, true);
      if (existing) {
        for (const alias of [row.id, old.id, old.slug]) if (typeof alias === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(alias)) await store.addAlias(alias, existing.id);
        skipped++; continue;
      }
      const saved = await store.save(draft, "legacy-import");
      for (const alias of [row.id, old.id, old.slug]) if (typeof alias === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(alias)) await store.addAlias(alias, saved.id);
      imported++;
    } catch { failed++; }
  }
  console.log(JSON.stringify({ imported, skipped, failed, publicationStatus: "draft" }));
  if (failed) process.exitCode = 1;
} finally { await store.close(); }
