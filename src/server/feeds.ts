import Parser from "rss-parser";
import type { NewsStoreAdapter } from "./store-types";
import { validateArticle, canonicalSourceUrl, ArticleValidationError, escapeHtml } from "./news-validation";
import type { Publisher } from "./publishers";
import type { Article } from "../types";
import { PUBLICATION_CHECK_VERSION } from "./auto-publication";
import { plainText } from "../lib/seo";

const parser = new Parser({ timeout: 15000, maxRedirects: 3, customFields: { item: [["media:content", "media", { keepArray: true }], ["media:credit", "mediaCredit"]] } });
export const ingestionState = { running: false, lastAttemptAt: null as string | null, lastSuccessAt: null as string | null, lastResult: null as unknown };
interface FeedItem { link?: string; title?: string; contentSnippet?: string; "content:encoded"?: string; isoDate?: string; creator?: string; author?: string; enclosure?: { url?: string; type?: string }; media?: { $?: { url?: string; medium?: string; type?: string } }[]; mediaCredit?: string }
export type LoadFeed = (url: string) => Promise<{ title?: string; items: FeedItem[] }>;
export function configuredFeeds(): string[] {
  const feeds = JSON.parse(process.env.FEED_URLS || "[]");
  if (!Array.isArray(feeds) || feeds.length > 30 || feeds.some(value => {
    try { const url = new URL(value); return typeof value !== "string" || url.protocol !== "https:" || Boolean(url.username || url.password); } catch { return true; }
  })) throw new Error("FEED_URLS must be a JSON array of up to 30 approved HTTPS feed URLs");
  return feeds;
}
export async function ingestFeeds(store: NewsStoreAdapter, loadFeed: LoadFeed = url => parser.parseURL(url), options: { publishers?: Publisher[]; onDraft?: (article: Article) => Promise<unknown>; maxPerPublisher?: number } = {}) {
  if (ingestionState.running) return { busy: true, inserted: 0, skipped: 0, errors: [] as string[] };
  ingestionState.running = true; ingestionState.lastAttemptAt = new Date().toISOString();
  const result = { busy: false, inserted: 0, skipped: 0, errors: [] as string[] };
  const sources = options.publishers ? options.publishers.filter(p => p.enabled && p.textAllowed).map(publisher => ({ url: publisher.feedUrl, publisher })) : configuredFeeds().map(url => ({ url, publisher: undefined as Publisher | undefined }));
  try {
    for (const { url: feedUrl, publisher } of sources) {
      try {
        const feed = await loadFeed(feedUrl); let accepted = 0;
        for (const item of feed.items.slice(0, 100)) {
          if (accepted >= (options.maxPerPublisher || 12)) break;
          try {
            if (!item.link || !item.title || !item.contentSnippet?.trim()) { result.skipped++; continue; }
            const originalUrl = canonicalSourceUrl(item.link);
            if (publisher && (!publisher.articleHosts.includes(new URL(originalUrl).hostname) || !item.isoDate || !Number.isFinite(Date.parse(item.isoDate)) || Date.parse(item.isoDate) < Date.now() - 48 * 3600000 || Date.parse(item.isoDate) > Date.now() + 5 * 60000)) { result.skipped++; continue; }
            const author = item.creator || item.author || "";
            if (publisher?.requireAuthor && !author.trim()) { result.skipped++; continue; }
            const media = item.media?.find(image => image.$?.url && (image.$.medium === "image" || image.$.type?.startsWith("image/")))?.$?.url;
            const image = media || (item.enclosure?.type?.startsWith("image/") ? item.enclosure.url : undefined);
            const sourceBody = item["content:encoded"] ? `<p>${escapeHtml(plainText(item["content:encoded"]))}</p>` : undefined;
            const article = validateArticle({ title: item.title, originalUrl, sourceUrl: feedUrl, sourceName: publisher?.name || feed.title || new URL(feedUrl).hostname,
              publisherId: publisher?._id, sourceAuthor: author, sourcePublishedAt: item.isoDate || undefined,
              textLicense: publisher?.textLicense, textLicenseUrl: publisher?._id === "global-voices" ? "https://creativecommons.org/licenses/by/3.0/" : publisher?.termsUrl,
              publisherImageUrl: image?.startsWith("https://") ? image : undefined, publisherImageCredit: typeof item.mediaCredit === "string" ? item.mediaCredit : "",
              summary: item.contentSnippet.slice(0, 1500), fullContent: sourceBody, category: publisher?.category || "General", region: "Global", coverage: "unknown", tags: ["Source excerpt"], status: "draft" });
            const existing = await store.get(article.id, true);
            if (existing) {
              result.skipped++;
              // An API-supplied draft must never gain feed trust just by claiming
              // a publisher ID. A retry must match the freshly fetched source.
              const matchesMetadata = ["title", "aiSummary", "publisherId", "sourceName", "sourceUrl", "sourceAuthor", "sourcePublishedAt", "publisherImageUrl", "publisherImageCredit", "textLicense", "textLicenseUrl", "tags"].every(key => JSON.stringify(existing[key as keyof Article]) === JSON.stringify(article[key as keyof Article]));
              const oldExcerptBody = validateArticle({ title: article.title, summary: item.contentSnippet.slice(0, 1500) }).fullContent;
              const matchesFeed = matchesMetadata && (existing.fullContent === article.fullContent || Boolean(sourceBody && existing.fullContent === oldExcerptBody));
              const outdatedCheck = existing.automationCheck?.verdict === "held" && existing.automationCheck.version !== PUBLICATION_CHECK_VERSION;
              if (matchesFeed && existing.status === "draft" && (!existing.aiGenerated || outdatedCheck)) {
                const refreshed = existing.fullContent === article.fullContent ? existing : await store.save(validateArticle({ fullContent: article.fullContent }, existing), "rss-ingestion", existing.modifiedAt);
                await options.onDraft?.(refreshed); accepted++;
              }
              continue;
            }
            const saved = await store.save(article, "rss-ingestion"); result.inserted++; accepted++;
            await options.onDraft?.(saved);
          } catch (error) {
            result.skipped++;
            if (!(error instanceof ArticleValidationError)) { result.errors.push(`Could not save or queue an item from ${new URL(feedUrl).hostname}`); break; }
          }
        }
      } catch { result.errors.push(`Could not ingest ${new URL(feedUrl).hostname}`); }
    }
    if (!result.errors.length) ingestionState.lastSuccessAt = new Date().toISOString();
    ingestionState.lastResult = result; return result;
  } finally { ingestionState.running = false; }
}
