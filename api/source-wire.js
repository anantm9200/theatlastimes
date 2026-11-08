import Parser from "rss-parser";

// Allowlisted publishers from the editorial source catalog. Do not enable
// unlicensed publishers or make up event headlines on failed RSS lookups.
const SOURCES = [
  { name: "Global Voices", feed: "https://globalvoices.org/feed/", hosts: ["globalvoices.org"], category: "World" },
  { name: "NASA", feed: "https://www.nasa.gov/feed/", hosts: ["www.nasa.gov", "science.nasa.gov"], category: "Science" },
  { name: "NOAA", feed: "https://www.noaa.gov/rss.xml", hosts: ["www.noaa.gov", "noaa.gov", "oceanservice.noaa.gov"], category: "Climate" },
  { name: "U.S. Securities and Exchange Commission", feed: "https://www.sec.gov/news/pressreleases.rss", hosts: ["www.sec.gov", "sec.gov"], category: "Business" },
];
const parser = new Parser({ timeout: 8500, maxRedirects: 2 });
const NOTE = "External publisher headlines. Not Atlas Times articles; open each original source to verify the report.";
let cache;
export async function gatherSourceWire(now = Date.now(), read = url => parser.parseURL(url)) {
  const groups = await Promise.all(SOURCES.map(async (publisher) => {
    try {
      const rss = await read(publisher.feed);
      if (!Array.isArray(rss?.items)) return [];
      return rss.items.slice(0, 20).flatMap(item => {
        const title = String(item.title || "").replace(/<[^>]*>/g, "").trim().slice(0, 220);
        const at = Date.parse(item.isoDate || item.pubDate || "");
        if (title.length < 10 || !Number.isFinite(at) || at > now + 300_000 || now - at > 96 * 3_600_000) return [];
        let link;
        try { link = new URL(item.link || ""); } catch { return []; }
        if (link.protocol !== "https:" || link.username || link.password || !publisher.hosts.includes(link.hostname)) return [];
        return [{ title, url: link.href, publisher: publisher.name, category: publisher.category, publishedAt: new Date(at).toISOString() }];
      });
    } catch {
      return [];
    }
  }));
  const unique = new Map();
  for (const article of groups.flat()) if (!unique.has(article.url)) unique.set(article.url, article);
  return {
    data: [...unique.values()].sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0,60),
    updatedAt: new Date(now).toISOString(), note: NOTE,
  };
}
export async function sourceWire(now=Date.now()) {
  if (cache?.until > now) return cache.value;
  const value = await gatherSourceWire(now);
  cache = { until: now + 10 * 60_000, value };
  return value;
}
