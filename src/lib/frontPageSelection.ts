import type { Article } from "../types";

export const BREAKING_WINDOW_HOURS = 12;
export const FRESH_NEWS_HOURS = 36;

function milliseconds(value?: string): number {
  if (!value) return NaN;
  return Date.parse(value);
}
export function reportAgeHours(article: Article, now = Date.now()): number {
  return (now - milliseconds(article.publishedAt)) / 3_600_000;
}
export function isConfirmedBreaking(article: Article, now = Date.now()): boolean {
  if (article.status !== "published") return false;
  if (!article.tags?.some(tag => /^(breaking|breaking news)$/i.test(tag.trim()))) return false;
  // A confirmed breaking desk requires an accountable editor, not just an AI importance score.
  if (article.publicationMode !== "human" || !article.reviewedAt) return false;
  const sourceAt = milliseconds(article.sourcePublishedAt);
  const publishedAt = milliseconds(article.publishedAt);
  const reviewedAt = milliseconds(article.reviewedAt);
  if (![sourceAt, publishedAt, reviewedAt].every(Number.isFinite)) return false;
  const window = BREAKING_WINDOW_HOURS * 3_600_000;
  return [sourceAt, publishedAt, reviewedAt].every(value => value <= now + 300_000 && now - value <= window);
}
export function diversifyReports(articles: Article[], limit: number): Article[] {
  const list = [...new Map(articles.map(a => [a.id, a])).values()];
  const selected: Article[] = [];
  const categories = new Set<string>(), sources = new Set<string>();
  // Start with a genuinely broad wire: one story per category and source.
  for (const article of list) {
    if (selected.length >= limit) break;
    const category = article.category.toLowerCase(), source = article.sourceName.toLowerCase();
    if (!categories.has(category) && !sources.has(source)) {
      selected.push(article); categories.add(category); sources.add(source);
    }
  }
  // Fill remaining slots with articles not already used, in publication order.
  for (const article of list) {
    if (selected.length >= limit) break;
    if (!selected.some(item => item.id === article.id)) selected.push(article);
  }
  return selected;
}
export const NEWS_DESKS = [
  { title: "World", slug: "world", categories: ["World", "Global", "Geopolitics"], kicker: "Global affairs and international developments" },
  { title: "Politics", slug: "politics", categories: ["Politics", "Geopolitics", "Global"], kicker: "Public policy, governments and institutions" },
  { title: "Business & markets", slug: "business", categories: ["Business", "Economy", "Trade", "Finance", "Markets"], kicker: "Companies, trade, regulation and finance" },
  { title: "Technology", slug: "technology", categories: ["Technology", "AI", "Tech Policy", "Security"], kicker: "Technology, AI, platforms and research" },
  { title: "Science", slug: "science", categories: ["Science"], kicker: "Research, discovery and exploration" },
  { title: "Climate", slug: "climate", categories: ["Climate", "Environment"], kicker: "Climate, oceans, energy and sustainability" },
  { title: "Health", slug: "health", categories: ["Health"], kicker: "Public health and scientific evidence" },
  { title: "Sports", slug: "sports", categories: ["Sports"], kicker: "International competitions and results" },
  { title: "Culture", slug: "culture", categories: ["Culture"], kicker: "Arts, media and cultural developments" },
] as const;
export function frontPageSelection(all: Article[], now = Date.now()) {
  const sorted = [...new Map(all.filter(a => a.status === "published").map(a => [a.id, a])).values()]
    .sort((a, b) => (milliseconds(b.publishedAt) || 0) - (milliseconds(a.publishedAt) || 0));
  const breaking = sorted.filter(article => isConfirmedBreaking(article, now));
  const breakingIds = new Set(breaking.map(article => article.id));
  const regular = sorted.filter(a => !breakingIds.has(a.id));
  const hero = breaking[0] || regular[0];
  const pool = regular.filter(a => a.id !== hero?.id);
  const latest = diversifyReports(pool, 7);
  const topIds = new Set([hero?.id, ...latest.map(a => a.id)]);
  const sectioned = NEWS_DESKS.map(desk => ({
    ...desk,
    reports: sorted.filter(a => !topIds.has(a.id) && (desk.categories as readonly string[]).includes(a.category)).slice(0, 6),
    count: sorted.filter(a => (desk.categories as readonly string[]).includes(a.category)).length,
  }));
  const used = new Set(sectioned.flatMap(desk => desk.reports.map(a => a.id)));
  const remaining = sorted.filter(a => !topIds.has(a.id) && !used.has(a.id)).slice(0, 42);
  return { hero, breaking, latest, sectioned, remaining, newest: sorted[0], total: sorted.length, hasFresh: sorted.some(a => reportAgeHours(a, now) <= FRESH_NEWS_HOURS) };
}
