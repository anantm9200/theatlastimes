import type { Article } from "../types";

export const SITE_NAME = "The Atlas Times";
export const DEFAULT_DESCRIPTION = "Global news with linked sources and clearly labeled AI-assisted summaries, covering politics, business, technology, and the economy.";
export const INDEX_ROBOTS = "index, follow, max-image-preview:large";

export function siteOrigin(configured?: string, fallback = "https://theatlastimes.com"): string {
  for (const value of [configured, fallback]) {
    try {
      const url = new URL(value || "");
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch { /* Try the fallback. */ }
  }
  return "https://theatlastimes.com";
}

export function articlePath(article: Pick<Article, "id">): string {
  return `/article/${encodeURIComponent(article.id)}`;
}

export function absoluteUrl(path: string, origin: string): string {
  return new URL(path, `${siteOrigin(origin)}/`).href;
}

export function safeExternalUrl(value?: string): string | undefined {
  try {
    const url = new URL(value || "");
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch { return undefined; }
}

export function plainText(value = ""): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function articleDescription(article: Article): string {
  const text = plainText(article.aiSummary || article.snippet || article.detailedHumanizedSummary || article.title);
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
}

export function isoDate(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function isEditorial(article: Pick<Article, "id">): boolean {
  return /^(?:src-)?editorial-/.test(article.id);
}

export function publisherStructuredData(origin: string) {
  return { "@type": "NewsMediaOrganization", "@id": `${siteOrigin(origin)}/#publisher`, name: SITE_NAME, url: `${siteOrigin(origin)}/` };
}

export function articleStructuredData(article: Article, origin: string) {
  const url = absoluteUrl(articlePath(article), origin);
  const sourceUrl = safeExternalUrl(article.originalUrl);
  const date = isoDate(article.publishedAt);
  const sourceDate = isoDate(article.sourcePublishedAt);
  const modified = isoDate(article.modifiedAt);
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "@id": `${url}#article`,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    headline: article.title,
    description: articleDescription(article),
    inLanguage: article.language || "en",
    articleSection: article.category,
    keywords: (article.tags || []).join(", "),
    publisher: publisherStructuredData(origin),
    ...(date ? { datePublished: date } : {}),
    ...(modified ? { dateModified: modified } : {}),
    ...(article.authorName ? { author: { "@type": "Person", name: article.authorName } } : {}),
    ...(safeExternalUrl(article.imageUrl) && !article.imageUrl?.includes("picsum.photos") && !article.imageUrl?.includes("/api/assets/visual") ? { image: [safeExternalUrl(article.imageUrl)] } : {}),
    ...(sourceUrl ? { citation: { "@type": "CreativeWork", url: sourceUrl, name: article.title, publisher: { "@type": "Organization", name: article.sourceName }, ...(sourceDate ? { datePublished: sourceDate } : {}) } } : {}),
  };
}

export function collectionStructuredData(title: string, pathname: string, articles: Article[], origin: string) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    url: absoluteUrl(pathname, origin),
    publisher: publisherStructuredData(origin),
    mainEntity: {
      "@type": "ItemList",
      itemListElement: articles.map((article, index) => ({ "@type": "ListItem", position: index + 1, url: absoluteUrl(articlePath(article), origin), name: article.title })),
    },
  };
}

// Safe to embed in an HTML script element, including untrusted feed text.
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
