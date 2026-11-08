/**
 * Read-only production availability and content-freshness probe.
 * Safe for GitHub Actions: no credentials, no ingestion, no article writes.
 */
import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export async function inspectProduction({
  baseUrl = "https://www.theatlastimes.com",
  maxAgeHours = 48,
  now = Date.now(),
  fetcher = fetch,
} = {}) {
  const origin = new URL(baseUrl);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash) {
    throw new Error("ATLAS_SITE_URL must be an HTTPS origin without credentials or query parameters");
  }
  if (!Number.isFinite(maxAgeHours) || maxAgeHours < 1 || maxAgeHours > 720) {
    throw new Error("ATLAS_MAX_ARTICLE_AGE_HOURS must be between 1 and 720");
  }

  const readJson = async (path) => {
    const target = new URL(path, origin);
    const response = await fetcher(target, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (response.url && new URL(response.url).origin !== origin.origin) {
      throw new Error(`Unexpected cross-origin redirect for ${path}`);
    }
    if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
    const raw = await response.text();
    if (raw.length > 2_000_000) throw new Error(`${path} returned an oversized response`);
    try { return JSON.parse(raw); }
    catch { throw new Error(`${path} did not return JSON`); }
  };

  const health = await readJson("/api/health");
  if (health?.status !== "ok" || health?.storage !== "ready") {
    throw new Error("News gateway or DGX-backed storage is unavailable");
  }
  const news = await readJson("/api/news?limit=1");
  if (!Array.isArray(news?.data) || !news.data.length) {
    throw new Error("No published articles returned by the news API");
  }
  const latest = news.data[0];
  const publishedMs = Date.parse(latest.publishedAt);
  if (!Number.isFinite(publishedMs)) throw new Error("Newest published article has an invalid publication timestamp");
  const ageHours = (now - publishedMs) / 3_600_000;
  if (ageHours < -2) throw new Error("Newest published article has a publication time in the future");
  return {
    ok: ageHours <= maxAgeHours,
    status: ageHours <= maxAgeHours ? "healthy" : "stale",
    ageHours: Math.max(0, ageHours),
    publishedAt: new Date(publishedMs).toISOString(),
    title: String(latest.title || "").replace(/[\r\n<>|]/g, " ").slice(0, 150),
    model: String(latest.generatedBy || "unknown").replace(/[\r\n<>|]/g, " ").slice(0, 80),
    message: ageHours <= maxAgeHours ? "DGX-backed API healthy; publication freshness within threshold" :
      `DGX-backed API available, but no article published within ${maxAgeHours} hours. Check worker, source ingestion, and editorial holds.`,
  };
}

export async function main() {
  const hours = Number(process.env.ATLAS_MAX_ARTICLE_AGE_HOURS || "48");
  let report;
  try {
    report = await inspectProduction({
      baseUrl: process.env.ATLAS_SITE_URL || "https://www.theatlastimes.com",
      maxAgeHours: hours,
    });
  } catch (error) {
    report = { ok: false, status: "unavailable", message: error instanceof Error ? error.message : "Unknown probe failure" };
  }

  const lines = [
    "## The Atlas Times production health",
    "",
    `- Status: **${report.status}**`,
    `- Result: ${report.message}`,
    ...("publishedAt" in report ? [
      `- Last published: ${report.publishedAt}`,
      `- Article age: ${report.ageHours.toFixed(1)} hours`,
      `- Latest headline: ${report.title}`,
      `- Recorded inference model: ${report.model}`,
    ] : []),
    "",
    "A stale feed does not by itself prove GPU failure: source availability and publication guards may be the cause.",
  ];
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
  }
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
