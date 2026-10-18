import type { Article } from "../types";
import { articleDescription, articlePath, articleStructuredData, collectionStructuredData, DEFAULT_DESCRIPTION, INDEX_ROBOTS, serializeJsonLd, SITE_NAME } from "../lib/seo";
import type { NewsStoreAdapter } from "./store-types";

export const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const link = (path: string, label: string) => `<a href="${escapeHtml(path)}">${escapeHtml(label)}</a>`;
const listing = (items: Article[]) => items.length ? items.map(a => `<article><h2>${link(articlePath(a), a.title)}</h2><p>${escapeHtml(a.aiSummary)}</p><p>${escapeHtml(a.sourceName)}</p></article>`).join("\n") : "<p>No published articles are available.</p>";

export async function pageContent(pathname: string, store: NewsStoreAdapter, origin: string) {
  let title = SITE_NAME, description = DEFAULT_DESCRIPTION, status = 200, noindex = false;
  let body = "", structuredData: unknown = undefined, image: string | undefined;
  const articleMatch = pathname.match(/^\/article\/([^/]+)$/);
  if (articleMatch) {
    const article = await store.get(decodeURIComponent(articleMatch[1]));
    if (!article) { status = 404; title = "Article not found"; body = "<h1>Article not found</h1>"; noindex = true; }
    else {
      title = `${article.title} | ${SITE_NAME}`; description = articleDescription(article); structuredData = articleStructuredData(article, origin); image = article.imageUrl;
      body = `<article><h1>${escapeHtml(article.title)}</h1><p>${escapeHtml(article.authorName || "The Atlas Times")} · Published <time datetime="${escapeHtml(article.publishedAt)}">${escapeHtml(article.publishedAt)}</time></p>${article.modifiedAt && article.modifiedAt !== article.publishedAt ? `<p>Updated <time datetime="${escapeHtml(article.modifiedAt)}">${escapeHtml(article.modifiedAt)}</time></p>` : ""}${article.sourcePublishedAt ? `<p>Source published <time datetime="${escapeHtml(article.sourcePublishedAt)}">${escapeHtml(article.sourcePublishedAt)}</time></p>` : ""}<p>${escapeHtml(article.aiSummary)}</p>${article.aiGenerated ? "<p>AI-assisted analysis, reviewed before publication.</p>" : ""}${article.fullContent || ""}${article.detailedHumanizedSummary ? `<h2>Summary</h2><p>${escapeHtml(article.detailedHumanizedSummary)}</p>` : ""}${article.keyPoints?.length ? `<h2>Key points</h2><ul>${article.keyPoints.map(p => `<li>${escapeHtml(p)}</li>`).join("")}</ul>` : ""}${article.whyItMatters ? `<h2>Context and interpretation</h2><p>${escapeHtml(article.whyItMatters)}</p>` : ""}${article.originalUrl ? `<p>Source: ${link(article.originalUrl, article.sourceName)}</p>` : ""}${article.imageUrl ? `<figure><img src="${escapeHtml(article.imageUrl)}" alt="${escapeHtml(article.imageCaption || article.title)}"><figcaption>${escapeHtml(article.imageCaption)} ${escapeHtml(article.imageCredit)} ${escapeHtml(article.imageLicense)}</figcaption></figure>` : ""}</article>`;
    }
  } else if (pathname === "/about" || pathname === "/editorial-policy") {
    title = `${pathname === "/about" ? "About" : "Editorial policy"} | ${SITE_NAME}`;
    description = pathname === "/about" ? "About The Atlas Times and its source-linked news coverage." : "How The Atlas Times uses sources, reviews AI-assisted drafts, and handles corrections.";
    body = `<h1>${pathname === "/about" ? "About The Atlas Times" : "Editorial policy"}</h1><p>We publish source-linked news and clearly labeled AI-assisted summaries. Source excerpts and generated drafts require editorial review before publication. AI does not verify facts.</p><p>Editors check source links, dates, facts, attribution and image rights. Summaries should add useful context and avoid copying full source reports. Publication and source dates are recorded separately.</p><p>Corrections update the report and its modification date. Readers can open the original report using each article's source link.</p>`;
  } else if (pathname === "/" || pathname === "/archives" || /^\/(category|region)\/[^/]+$/.test(pathname)) {
    const [,kind,value] = pathname.match(/^\/(category|region)\/([^/]+)$/) || [];
    const filter = value ? decodeURIComponent(value).replace(/-/g, " ") : undefined;
    const label = filter || (pathname === "/archives" ? "News archive" : "Latest news");
    title = `${label} | ${SITE_NAME}`;
    const items = await store.list({ ...(kind === "category" ? { category: filter } : kind === "region" ? { region: filter } : {}), limit: 100 });
    body = `<h1>${escapeHtml(label)}</h1>${listing(items)}`;
    structuredData = collectionStructuredData(title, pathname, items, origin);
    if (filter && !items.length) { status = 404; noindex = true; }
  } else if (["/preferences", "/briefcase", "/new-news", "/editorial"].includes(pathname) || /^\/article\/[^/]+\/(edit|delete)$/.test(pathname)) {
    title = `Reader and editorial tools | ${SITE_NAME}`; noindex = true; body = "<h1>Reader and editorial tools</h1><p>JavaScript is required to use these tools.</p>";
  } else { status = 404; noindex = true; title = "Page not found"; body = "<h1>Page not found</h1>"; }
  return { title, description, status, noindex, body, structuredData, image };
}

export async function renderPage(template: string, pathname: string, store: NewsStoreAdapter, origin: string) {
  const page = await pageContent(pathname, store, origin);
  const head = `<title data-rh="true">${escapeHtml(page.title)}</title><meta data-rh="true" name="description" content="${escapeHtml(page.description)}"><meta data-rh="true" name="robots" content="${page.noindex ? "noindex, follow" : INDEX_ROBOTS}"><meta name="atlas:site-url" content="${escapeHtml(origin)}"><link data-rh="true" rel="canonical" href="${escapeHtml(origin + pathname)}"><meta data-rh="true" property="og:title" content="${escapeHtml(page.title)}"><meta data-rh="true" property="og:description" content="${escapeHtml(page.description)}"><meta data-rh="true" property="og:url" content="${escapeHtml(origin + pathname)}"><meta data-rh="true" property="og:site_name" content="${SITE_NAME}"><meta data-rh="true" property="og:type" content="${pathname.startsWith("/article/") && page.status === 200 ? "article" : "website"}">${page.structuredData ? `<script data-rh="true" type="application/ld+json">${serializeJsonLd(page.structuredData)}</script>` : ""}`;
  const social = `<meta data-rh="true" name="twitter:card" content="${page.image ? "summary_large_image" : "summary"}"><meta data-rh="true" name="twitter:title" content="${escapeHtml(page.title)}"><meta data-rh="true" name="twitter:description" content="${escapeHtml(page.description)}">${page.image ? `<meta data-rh="true" property="og:image" content="${escapeHtml(page.image)}"><meta data-rh="true" name="twitter:image" content="${escapeHtml(page.image)}">` : ""}`;
  const cleaned = template.replace(/<title[\s\S]*?<\/title>/gi, "").replace(/<meta\b[^>]*(?:name=["'](?:description|robots|twitter:[^"']+)["']|property=["']og:[^"']+["'])[^>]*>/gi, "").replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, "");
  return { status: page.status, noindex: page.noindex, html: cleaned.replace("</head>", `${head}${social}</head>`).replace(/<div id="root"><\/div>/, `<div id="root"><header>${link("/", SITE_NAME)}<nav>${link("/archives", "Archives")} · ${link("/about", "About")} · ${link("/editorial-policy", "Editorial policy")}</nav></header><main>${page.body}</main></div>`) };
}
