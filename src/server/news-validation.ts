import crypto from "node:crypto";
import sanitizeHtml from "sanitize-html";
import { decodeHTML } from "entities";
import type { Article } from "../types/index.ts";

export class ArticleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArticleValidationError";
  }
}

const fail = (message: string): never => { throw new ArticleValidationError(message); };
const has = (input: Record<string, unknown>, field: string) => Object.prototype.hasOwnProperty.call(input, field);

function string(value: unknown, field: string, max: number, fallback = ""): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") fail(`${field} must be a string`);
  if ((value as string).length > max) fail(`${field} must be at most ${max} characters`);
  return (value as string).trim();
}

function plain(value: unknown, field: string, max: number, fallback = ""): string {
  const text = string(value, field, max, fallback);
  // Text fields are escaped by their HTML/React renderer. Decode entities once
  // here so an ampersand in a headline is not stored as literal HTML markup.
  return decodeHTML(sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} })).trim();
}

export function normalizeSourceUrl(value: unknown, field = "originalUrl"): string {
  const raw = string(value, field, 2048);
  if (!raw) return "";
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return fail(`${field} must be an absolute HTTP or HTTPS URL`); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    fail(`${field} must be an HTTP or HTTPS URL without credentials`);
  }
  parsed.hash = "";
  for (const key of [...parsed.searchParams.keys()]) {
    if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) parsed.searchParams.delete(key);
  }
  parsed.searchParams.sort();
  return parsed.toString();
}

export const canonicalSourceUrl = (value: string): string => normalizeSourceUrl(value);

const escapeHtml = (text: string): string => text.replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!);

function date(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const text = string(value, field, 80);
  // Disallow implementation-dependent Date parsing of numbers and partial dates.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(text)) {
    fail(`${field} must be an ISO 8601 timestamp with a timezone`);
  }
  const valueMs = Date.parse(text);
  if (!Number.isFinite(valueMs)) fail(`${field} is invalid`);
  const [year, month, day] = text.slice(0, 10).split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth) fail(`${field} is invalid`);
  return new Date(valueMs).toISOString();
}

function strings(value: unknown, field: string, count: number, length: number, fallback: string[] = []): string[] {
  if (value === undefined) return [...fallback];
  if (!Array.isArray(value) || value.length > count) fail(`${field} must be an array of at most ${count} strings`);
  return [...new Set((value as unknown[]).map((item) => plain(item, field, length)).filter(Boolean))];
}

function score(value: unknown, field: string, fallback = 0): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    fail(`${field} must be a number between 0 and 100`);
  }
  return value as number;
}

function html(value: unknown, fallback?: string): string {
  return sanitizeHtml(string(value, "fullContent", 100_000, fallback), {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "a", "code", "pre"],
    allowedAttributes: { a: ["href", "title"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
  });
}

function slugFor(title: string, id: string): string {
  const stem = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100).replace(/-$/, "") || "news";
  return `${stem}-${id.replace(/^(article|editorial)-/, "").slice(0, 12)}`;
}

/** Validate API input. Existing identity and publication time cannot be changed by input. */
export function validateArticle(input: unknown, existing?: Article): Article {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("Article must be a JSON object");
  let size: number;
  try { size = Buffer.byteLength(JSON.stringify(input), "utf8"); } catch { return fail("Article must be serializable JSON"); }
  if (size > 256_000) fail("Article payload exceeds 256 KB");
  const body = input as Record<string, unknown>;
  const title = plain(body.title, "title", 300, existing?.title);
  if (!title) fail("A nonempty title is required");
  const originalUrl = normalizeSourceUrl(has(body, "originalUrl") ? body.originalUrl : existing?.originalUrl);
  if (existing && originalUrl !== normalizeSourceUrl(existing.originalUrl)) fail("originalUrl cannot be changed on an existing article");
  const id = existing?.id || (originalUrl
    ? `article-${crypto.createHash("sha256").update(originalUrl).digest("hex")}`
    : `editorial-${crypto.randomUUID()}`);
  const status = body.status ?? existing?.status ?? "draft";
  if (!["draft", "published", "archived"].includes(status as string)) fail("status must be draft, published, or archived");
  const now = new Date().toISOString();
  const sourcePublishedAt = date(body.sourcePublishedAt ?? existing?.sourcePublishedAt, "sourcePublishedAt");
  const firstPublication = status === "published" && !existing?.publishedAt;
  const summary = plain(body.summary ?? body.aiSummary, "aiSummary", 5000, existing?.aiSummary);
  const article: Article = {
    id,
    slug: existing?.slug || slugFor(title, id),
    title,
    sourceName: plain(body.sourceName, "sourceName", 160, existing?.sourceName || "The Atlas Times"),
    sourceUrl: normalizeSourceUrl(has(body, "sourceUrl") ? body.sourceUrl : existing?.sourceUrl, "sourceUrl"),
    originalUrl,
    publishedAt: existing?.publishedAt || (firstPublication ? now : ""),
    fetchedAt: existing?.fetchedAt || now,
    modifiedAt: now,
    sourcePublishedAt,
    category: plain(body.category, "category", 80, existing?.category || "World"),
    region: plain(body.region, "region", 80, existing?.region || "Global"),
    language: plain(body.language, "language", 20, existing?.language || "en"),
    aiSummary: summary,
    fullContent: html(body.fullContent, existing?.fullContent || (summary ? `<p>${escapeHtml(summary)}</p>` : "")),
    tags: strings(body.tags, "tags", 30, 80, existing?.tags),
    // Zero means unrated. A score is never inferred from text or source reputation.
    importanceScore: score(body.importanceScore, "importanceScore", existing?.importanceScore),
    relevanceScore: score(body.relevanceScore, "relevanceScore", existing?.relevanceScore),
    credibilityScore: score(body.credibilityScore, "credibilityScore", existing?.credibilityScore),
    status: status as Article["status"],
  };
  const textFields = {
    authorName: 160, reviewNote: 4000, generatedBy: 200, imageType: 80, imageSource: 200,
    imageLicense: 1000, imageCredit: 500, imageCaption: 1000, whyItMatters: 5000,
    detailedHumanizedSummary: 15000, subCategory: 80, country: 80, snippet: 5000,
  } as const;
  for (const [field, max] of Object.entries(textFields)) {
    const value = plain(body[field], field, max, existing?.[field as keyof Article] as string | undefined);
    if (value) (article as unknown as Record<string, unknown>)[field] = value;
  }
  const imageUrl = normalizeSourceUrl(has(body, "imageUrl") ? body.imageUrl : existing?.imageUrl, "imageUrl");
  if (imageUrl) article.imageUrl = imageUrl;
  article.keyPoints = strings(body.keyPoints, "keyPoints", 20, 1000, existing?.keyPoints);
  const entities = body.entities ?? existing?.entities;
  if (entities !== undefined) {
    if (!entities || typeof entities !== "object" || Array.isArray(entities)) fail("entities must be an object");
    const entityInput = entities as Record<string, unknown>;
    article.entities = {
      people: strings(entityInput.people, "entities.people", 30, 160),
      companies: strings(entityInput.companies, "entities.companies", 30, 160),
      locations: strings(entityInput.locations, "entities.locations", 30, 160),
      organizations: strings(entityInput.organizations, "entities.organizations", 30, 160),
    };
  }
  const sentiment = body.sentiment ?? existing?.sentiment;
  if (sentiment !== undefined) {
    if (!["positive", "neutral", "negative", "mixed"].includes(sentiment as string)) fail("sentiment is invalid");
    article.sentiment = sentiment as Article["sentiment"];
  }
  if (body.aiGenerated !== undefined && typeof body.aiGenerated !== "boolean") fail("aiGenerated must be a boolean");
  article.aiGenerated = (body.aiGenerated as boolean | undefined) ?? existing?.aiGenerated ?? false;
  article.reviewedAt = status === "draft" ? undefined : date(body.reviewedAt ?? existing?.reviewedAt, "reviewedAt");
  const provenance = body.provenance ?? existing?.provenance;
  if (provenance !== undefined) {
    if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) fail("provenance must be an object");
    const prov = provenance as Record<string, unknown>;
    const urls = strings(prov.sourceUrls, "provenance.sourceUrls", 20, 2048);
    article.provenance = {
      sourceUrls: [...new Set(urls.map((url) => normalizeSourceUrl(url, "provenance.sourceUrls")))],
      retrievedAt: date(prov.retrievedAt, "provenance.retrievedAt"),
      model: plain(prov.model, "provenance.model", 200) || undefined,
      promptVersion: plain(prov.promptVersion, "provenance.promptVersion", 100) || undefined,
    };
  }
  return article;
}
