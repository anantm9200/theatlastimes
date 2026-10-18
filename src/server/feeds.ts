import Parser from "rss-parser";
import type { NewsStoreAdapter } from "./store-types";
import { validateArticle, canonicalSourceUrl } from "./news-validation";

const parser = new Parser({ timeout: 15000, maxRedirects: 3 });
export const ingestionState = { running: false, lastAttemptAt: null as string | null, lastSuccessAt: null as string | null, lastResult: null as unknown };

export function configuredFeeds(): string[] {
  const feeds = JSON.parse(process.env.FEED_URLS || "[]");
  if (!Array.isArray(feeds) || feeds.length > 30 || feeds.some(v => typeof v !== "string" || !v.startsWith("https://"))) throw new Error("FEED_URLS must be a JSON array of up to 30 approved HTTPS feed URLs");
  return feeds;
}

export async function ingestFeeds(store: NewsStoreAdapter, loadFeed: (url: string) => Promise<{ title?: string; items: { link?: string; title?: string; contentSnippet?: string; isoDate?: string }[] }> = url => parser.parseURL(url)) {
  if (ingestionState.running) return { busy: true, inserted: 0, skipped: 0, errors: [] as string[] };
  ingestionState.running = true;
  ingestionState.lastAttemptAt = new Date().toISOString();
  const result = { busy: false, inserted: 0, skipped: 0, errors: [] as string[] };
  try {
    for (const feedUrl of configuredFeeds()) {
      try {
        const feed = await loadFeed(feedUrl);
        for (const item of feed.items.slice(0, 100)) {
          try {
            if (!item.link || !item.title || !item.contentSnippet?.trim()) { result.skipped++; continue; }
            const originalUrl = canonicalSourceUrl(item.link);
            // Storage also enforces URL uniqueness across processes and restarts.
            const article = validateArticle({ title: item.title, originalUrl, sourceUrl: feedUrl, sourceName: feed.title || new URL(feedUrl).hostname,
              sourcePublishedAt: item.isoDate || undefined, summary: item.contentSnippet.slice(0, 1500), category: "General", tags: ["Source excerpt"], status: "draft" });
            if (await store.get(article.id, true)) { result.skipped++; continue; }
            try { await store.save(article, "rss-ingestion"); }
            catch { result.errors.push(`Storage failed for ${new URL(feedUrl).hostname}; the source can be retried`); break; }
            result.inserted++;
          } catch (error) { result.skipped++; }
        }
      } catch { result.errors.push(`Could not ingest ${new URL(feedUrl).hostname}`); }
    }
    if (!result.errors.length) ingestionState.lastSuccessAt = new Date().toISOString();
    ingestionState.lastResult = result;
    return result;
  } finally { ingestionState.running = false; }
}
