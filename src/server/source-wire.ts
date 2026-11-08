import Parser from "rss-parser";
import { publisherCatalog } from "./publishers";

export interface SourceWireItem {
  title: string;
  url: string;
  publisher: string;
  category: string;
  publishedAt: string;
}
export interface SourceWireResult {
  data: SourceWireItem[];
  updatedAt: string;
  note: string;
}
const reader = new Parser({ timeout: 8500, maxRedirects: 2 });
const SOURCE_AGE_HOURS = 96;
const NOTE = "External publisher headlines. Not Atlas Times articles; open each original source to verify the report.";
let cache: { until: number; value: SourceWireResult } | undefined;
export async function gatherSourceWire(
  now = Date.now(),
  read: (url: string) => Promise<{ items: Array<{ title?: string; link?: string; isoDate?: string; pubDate?: string }> }> =
    url => reader.parseURL(url),
): Promise<SourceWireResult> {
  // All hosts and feed URLs come from our explicit, rights-reviewed publisher catalog.
  // There is no user-controlled URL input, article copying, or image scraping.
  const sources = publisherCatalog.filter(publisher => publisher.enabled && publisher.textAllowed).slice(0, 8);
  const groups = await Promise.all(sources.map(async publisher => {
    try {
      const feed = await read(publisher.feedUrl);
      if (!Array.isArray(feed.items)) return [];
      return feed.items.slice(0, 20).flatMap(item => {
        const title = String(item.title || "").replace(/<[^>]*>/g, "").trim().slice(0, 220);
        const published = Date.parse(item.isoDate || item.pubDate || "");
        if (title.length < 10 || !Number.isFinite(published) || published > now + 300_000 ||
          now - published > SOURCE_AGE_HOURS * 3_600_000) return [];
        let link: URL;
        try { link = new URL(item.link || ""); } catch { return []; }
        if (link.protocol !== "https:" || link.username || link.password ||
          !publisher.articleHosts.includes(link.hostname)) return [];
        return [{ title, url: link.href, publisher: publisher.name, category: publisher.category,
          publishedAt: new Date(published).toISOString() }];
      });
    } catch {
      // One unavailable publisher must not blank the entire official-source wire.
      return [];
    }
  }));
  const unique = new Map<string, SourceWireItem>();
  for (const item of groups.flat()) if (!unique.has(item.url)) unique.set(item.url, item);
  return {
    data: [...unique.values()].sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0, 60),
    updatedAt: new Date(now).toISOString(), note: NOTE,
  };
}
export async function sourceWire(now = Date.now()): Promise<SourceWireResult> {
  if (cache && cache.until > now) return cache.value;
  const value = await gatherSourceWire(now);
  cache = { value, until: now + 10 * 60_000 };
  return value;
}
