import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });
import express from "express";
import rateLimit from "express-rate-limit";
import path from "node:path";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { NewsStore } from "./src/server/news-store";
import { NewsConflictError, type NewsStoreAdapter } from "./src/server/store-types";
import { createConfiguredStore } from "./src/server/store";
import { MongoNewsStore } from "./src/server/mongo-news-store";
import { MongoNewsJobs } from "./src/server/news-jobs";
import { validateArticle, ArticleValidationError } from "./src/server/news-validation";
import { requireNewsAuth, requireEditor } from "./src/server/auth";
import { analyzeArticle, aiConfiguration } from "./src/server/ai";
import { configuredFeeds, ingestFeeds, ingestionState } from "./src/server/feeds";
import { renderPage, escapeHtml } from "./src/server/html";
import { articlePath, siteOrigin } from "./src/lib/seo";
import { plainText } from "./src/lib/seo";
import { rateLimitClientKey } from "./src/server/client-ip";
import { constantEqual, EditorSessions, sessionToken, writeSessionCookie } from "./src/server/editor-sessions";
import { Publishers, NEWS_CATEGORIES } from "./src/server/publishers";
import { publicArticle } from "./src/server/public-article";

function integer(value: unknown, fallback: number, max: number) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max) throw new ArticleValidationError(`Expected an integer between 1 and ${max}`);
  return Number(value);
}
function textQuery(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > 200) throw new ArticleValidationError("Invalid filter");
  return value;
}

export function createApp(store: NewsStoreAdapter = new NewsStore(), jobs?: MongoNewsJobs) {
  const app = express();
  if (process.env.NEWS_API_KEY && process.env.NEWS_API_KEY === process.env.NEWS_INGEST_KEY) throw new Error("Editor and ingestion credentials must be different");
  const origin = siteOrigin(process.env.SITE_URL || process.env.APP_URL);
  app.disable("x-powered-by");
  const sessions = store instanceof MongoNewsStore ? new EditorSessions(store.db) : undefined;
  const publishers = store instanceof MongoNewsStore ? new Publishers(store.db) : undefined;
  app.locals.editorSessions = sessions;
  if (process.env.DGX_GATEWAY_KEY) {
    if (process.env.DGX_GATEWAY_KEY.length < 32) throw new Error("Use a strong DGX gateway key");
    app.use((req, res, next) => {
      if (!constantEqual(req.get("X-Atlas-Gateway-Key") || "", process.env.DGX_GATEWAY_KEY!)) { res.status(403).json({ error: "Gateway authentication required" }); return; }
      req.headers["x-real-ip"] = req.headers["x-atlas-client-ip"];
      next();
    });
  }
  if (process.env.TRUST_PROXY_HOPS) app.set("trust proxy", integer(process.env.TRUST_PROXY_HOPS, 0, 5));
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin"); res.setHeader("X-Frame-Options", "DENY"); next();
  });
  app.use(express.json({ limit: "256kb" }));
  app.use("/api", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Robots-Tag", "noindex"); next(); });
  const platformRateKey = process.env.VERCEL === "1" || process.env.DGX_GATEWAY_KEY ? { keyGenerator: (request: express.Request) => rateLimitClientKey(request, true) } : {};
  app.use("/api", rateLimit({ ...platformRateKey, windowMs: 60000, limit: 300, standardHeaders: "draft-7", legacyHeaders: false }));
  const expensiveLimit = rateLimit({ ...platformRateKey, windowMs: 15 * 60000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false });
  const asyncRoute = (handler: express.RequestHandler): express.RequestHandler => (req, res, next) => { Promise.resolve(handler(req, res, next)).catch(next); };
  const route = (method: "get" | "post" | "put" | "delete", pathname: string, ...handlers: express.RequestHandler[]) => app[method](pathname, ...handlers.map(asyncRoute));
  route("post", "/api/auth/login", expensiveLimit, async (req, res) => {
    if (!sessions) { res.status(503).json({ error: "Editor accounts require MongoDB" }); return; }
    const { username, password } = req.body || {};
    if (typeof username !== "string" || username.length > 200 || typeof password !== "string" || password.length > 256) { res.status(400).json({ error: "Enter your editor username and password" }); return; }
    const session = await sessions.login(username.trim(), password);
    if (!session) { res.status(401).json({ error: "Sign-in failed" }); return; }
    writeSessionCookie(res, session.token, session.expiresAt);
    res.json({ user: { username: session.username }, csrfToken: session.csrfToken });
  });
  route("get", "/api/auth/session", async (req, res) => {
    const token = sessionToken(req), username = token && sessions ? await sessions.verify(token) : undefined;
    res.json({ user: username ? { username } : null, ...(username && token && sessions ? { csrfToken: sessions.csrf(token) } : {}) });
  });
  route("post", "/api/auth/logout", requireNewsAuth, requireEditor, async (req, res) => {
    const token = sessionToken(req); if (token && sessions) await sessions.revoke(token);
    writeSessionCookie(res, "", new Date(0)); res.json({ success: true });
  });
  route("get", "/api/health", async (_req, res) => {
    try { await store.count(); res.json({ status: "ok", storage: "ready" }); }
    catch { res.status(503).json({ status: "unavailable", storage: "unavailable" }); }
  });
  route("get", "/api/news", async (req, res, next) => {
    try {
      const limit = integer(req.query.limit, 100, 1000);
      const page = integer(req.query.page, 1, 1000000);
      const articles = await store.list({ limit, offset: (page - 1) * limit, search: textQuery(req.query.search), category: textQuery(req.query.category)?.replace(/-/g, " "), region: textQuery(req.query.region)?.replace(/-/g, " ") });
      res.json({ data: articles.map(publicArticle), page, limit });
    } catch (e) { next(e); }
  });
  route("get", "/api/admin/news/export", requireNewsAuth, requireEditor, async (_req, res) => {
    const data = [];
    for (const status of ["draft", "published", "archived"] as const) {
      const count = await store.count(status);
      for (let offset = 0; offset < count; offset += 1000) data.push(...await store.list({ status, offset, limit: 1000 }));
    }
    res.json({ version: 1, exportedAt: new Date().toISOString(), data });
  });
  route("get", "/api/admin/news", requireNewsAuth, requireEditor, async (req, res, next) => {
    try {
      const status = req.query.status || "draft";
      if (!["draft", "published", "archived"].includes(String(status))) throw new ArticleValidationError("Invalid status");
      const limit = integer(req.query.limit, 100, 1000), page = integer(req.query.page, 1, 1000000);
      res.json({ data: await store.list({ status: status as any, limit, offset: (page - 1) * limit }), page, total: await store.count(status as any) });
    } catch (e) { next(e); }
  });
  route("get", "/api/admin/news/:id", requireNewsAuth, requireEditor, async (req, res) => {
    const article = await store.get(req.params.id, true); if (!article) { res.status(404).json({ error: "Article not found" }); return; } res.json({ data: article });
  });
  route("get", "/api/admin/status", requireNewsAuth, requireEditor, async (_req, res) => res.json({ ai: aiConfiguration(), ingestion: ingestionState, counts: { published: await store.count(), draft: await store.count("draft"), archived: await store.count("archived") } }));
  route("get", "/api/admin/audit", requireNewsAuth, requireEditor, async (_req, res) => res.json({ data: await store.audit(100) }));
  route("get", "/api/admin/publishers", requireNewsAuth, requireEditor, async (_req, res) => res.json({ data: publishers ? await publishers.list() : [] }));
  route("put", "/api/admin/publishers/:id/images", requireNewsAuth, requireEditor, async (req, res) => {
    if (!publishers || typeof req.body?.enabled !== "boolean") { res.status(400).json({ error: "Provide an enabled setting for a configured publisher" }); return; }
    try { await publishers.setImages(req.params.id, req.body.enabled); res.json({ success: true }); }
    catch (error) { res.status(400).json({ error: (error as Error).message }); }
  });
  route("get", "/api/admin/ingestion", requireNewsAuth, requireEditor, async (_req, res) => {
    res.json({ dailyAt: process.env.INGESTION_DAILY_AT || "06:00", timeZone: process.env.INGESTION_TIMEZONE || "Asia/Dubai", enabled: process.env.ENABLE_INGESTION === "true", autoPublish: process.env.AUTO_PUBLISH === "true", runs: store instanceof MongoNewsStore ? await store.db.collection("news_ingestion_runs").find({}, { projection: { owner: 0 } }).sort({ _id: -1 }).limit(10).toArray() : [] });
  });
  route("post", "/api/admin/ingest", requireNewsAuth, expensiveLimit, asyncRoute(async (_req, res) => { const result = await ingestFeeds(store, undefined, publishers ? { publishers: await publishers.list(), onDraft: article => jobs ? jobs.enqueue(article, "daily-ingestion") : Promise.resolve() } : {}); res.status(result.errors.length ? 502 : 200).json(result); }));
  route("get", "/api/news/:id", async (req, res) => { const article = await store.get(req.params.id); if (!article) { res.status(404).json({ error: "Article not found" }); return; } res.json({ data: publicArticle(article) }); });
  const publishing = (input: Record<string, any>, existing?: any) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new ArticleValidationError("Expected an article object");
    if (input.status === "published" || (existing?.status === "published" && input.status !== "draft" && input.status !== "archived")) {
      if (typeof input.reviewNote !== "string" || input.reviewNote.trim().length < 10) throw new ArticleValidationError("Publishing requires a new review note of at least 10 characters confirming facts, sources, and rights");
      return { ...input, publicationMode: "human", reviewedAt: new Date().toISOString() };
    }
    return input;
  };
  const validateForSave = (input: Record<string, any>, existing?: any) => {
    const article = validateArticle(publishing(input, existing), existing);
    if (article.status === "published") {
      if (article.coverage !== "global") throw new ArticleValidationError("Only globally relevant news can be published; confirm global coverage");
      if (!NEWS_CATEGORIES.includes(article.category as typeof NEWS_CATEGORIES[number])) throw new ArticleValidationError("Choose a supported global news category");
      if (!article.authorName || (article.reviewNote?.length || 0) < 10 || !plainText(article.aiSummary) || !plainText(article.fullContent)) throw new ArticleValidationError("Publishing requires an accountable author, a review note, a summary, and an article body");
      if (article.imageUrl && (!article.imageCredit || !article.imageLicense)) throw new ArticleValidationError("Publishing an image requires its credit and license or permission");
    }
    return article;
  };
  route("post", "/api/news", requireNewsAuth, async (req, res, next) => {
    try {
      if (!req.body || Array.isArray(req.body)) throw new ArticleValidationError("Expected an article object");
      if (res.locals.principal!.role === "ingest" && req.body.status && req.body.status !== "draft") { res.status(403).json({ error: "Ingestion credentials can only create drafts" }); return; }
      const input = res.locals.principal!.role === "ingest" ? { ...req.body, status: "draft", reviewedAt: undefined, reviewNote: undefined } : publishing(req.body);
      const article = validateForSave(input);
      const existing = await store.get(article.id, true);
      if (existing) { res.status(200).json({ data: existing.status === "draft" || res.locals.principal!.role === "editor" ? existing : { id: existing.id, status: existing.status }, duplicate: true }); return; }
      res.status(201).json({ data: await store.save(article, res.locals.principal!.actor) });
    } catch (e) { next(e); }
  });
  route("put", "/api/news/:id", requireNewsAuth, requireEditor, async (req, res, next) => {
    try {
      const existing = await store.get(req.params.id, true);
      if (!existing) { res.status(404).json({ error: "Article not found" }); return; }
      if (req.body?.expectedModifiedAt !== undefined && req.body.expectedModifiedAt !== existing.modifiedAt) throw new NewsConflictError();
      res.json({ data: await store.save(validateForSave(req.body, existing), res.locals.principal!.actor, existing.modifiedAt) });
    } catch (e) { next(e); }
  });
  route("delete", "/api/news/:id", requireNewsAuth, requireEditor, async (req, res) => { if (!(await store.delete(req.params.id, res.locals.principal!.actor))) { res.status(404).json({ error: "Article not found" }); return; } res.json({ success: true }); });
  const analyzing = new Set<string>();
  route("post", "/api/news/:id/analyze", requireNewsAuth, expensiveLimit, asyncRoute(async (req, res) => {
    const article = await store.get(req.params.id, true);
    if (!article) { res.status(404).json({ error: "Article not found" }); return; }
    if (article.status !== "draft") { res.status(409).json({ error: "Return this article to draft before generating analysis" }); return; }
    if (process.env.AI_EXECUTION === "worker" || process.env.VERCEL === "1") {
      if (!jobs) { res.status(503).json({ error: "A shared MongoDB job queue is required for DGX analysis" }); return; }
      const job = await jobs.enqueue(article, res.locals.principal!.actor);
      res.status(202).json({ data: article, job: { id: job.id, status: job.status } });
      return;
    }
    if (analyzing.has(article.id)) { res.status(409).json({ error: "Analysis is already running" }); return; }
    analyzing.add(article.id);
    try {
      const analysis = await analyzeArticle(article);
      const latest = await store.get(article.id, true);
      if (!latest || latest.modifiedAt !== article.modifiedAt || latest.status !== "draft") { res.status(409).json({ error: "The article changed during analysis; retry" }); return; }
      const model = process.env.AI_MODEL || process.env.GEMINI_MODEL;
      const result = validateArticle({ ...analysis, aiGenerated: true, generatedBy: model, provenance: { sourceUrls: article.originalUrl ? [article.originalUrl] : [], retrievedAt: article.fetchedAt, model, promptVersion: "source-summary-v1" }, status: "draft", reviewedAt: undefined, reviewNote: undefined }, latest);
      res.json({ data: await store.save(result, res.locals.principal!.actor, latest.modifiedAt) });
    } catch (e) { res.status(502).json({ error: e instanceof Error ? e.message : "Analysis failed; draft unchanged" }); }
    finally { analyzing.delete(article.id); }
  }));
  // Public reads never start inference or substitute fictional data.
  route("get", "/api/briefings", async (_req, res) => res.json({ data: [] }));
  route("get", "/api/market-pulse", async (_req, res) => res.status(503).json({ data: [], error: "Market data is not configured" }));
  route("get", "/api/admin/jobs/:id", requireNewsAuth, requireEditor, async (req, res) => {
    const job = jobs && await jobs.get(req.params.id);
    if (!job) { res.status(404).json({ error: "Job not found" }); return; }
    res.json({ data: job });
  });
  app.use("/api", async (_req, res) => res.status(404).json({ error: "API endpoint not found" }));
  route("get", "/robots.txt", async (_req, res) => res.type("text/plain").send(`User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\nSitemap: ${origin}/news-sitemap.xml\n`));
  const xmlUrl = (a: any) => `<url><loc>${escapeHtml(origin + articlePath(a))}</loc><lastmod>${escapeHtml(a.modifiedAt || a.publishedAt)}</lastmod></url>`;
  route("get", "/sitemap.xml", async (_req, res) => {
    const pages = Math.ceil((await store.count()) / 1000);
    res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${origin}/sitemaps/pages.xml</loc></sitemap>${Array.from({ length: pages }, (_, i) => `<sitemap><loc>${origin}/sitemaps/articles-${i + 1}.xml</loc></sitemap>`).join("")}</sitemapindex>`);
  });
  route("get", "/sitemaps/pages.xml", async (_req, res) => res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["/", "/archives", "/about", "/editorial-policy"].map(p => `<url><loc>${origin}${p}</loc></url>`).join("")}</urlset>`));
  route("get", "/sitemaps/articles-:page.xml", async (req, res, next) => {
    try { const page = integer(req.params.page, 1, Math.max(1, Math.ceil((await store.count()) / 1000))); res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${(await store.list({ limit: 1000, offset: (page - 1) * 1000 })).map(xmlUrl).join("")}</urlset>`); } catch(e) { next(e); }
  });
  route("get", "/news-sitemap.xml", async (_req, res) => {
    const recent = (await store.list({ limit: 1000 })).filter(a => Date.parse(a.publishedAt) >= Date.now() - 48 * 3600000);
    res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${recent.map(a => `<url><loc>${origin}${articlePath(a)}</loc><news:news><news:publication><news:name>The Atlas Times</news:name><news:language>${escapeHtml(a.language)}</news:language></news:publication><news:publication_date>${escapeHtml(a.publishedAt)}</news:publication_date><news:title>${escapeHtml(a.title)}</news:title></news:news></url>`).join("")}</urlset>`);
  });
  route("get", "/feed.xml", async (_req, res) => res.type("application/rss+xml").send(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>The Atlas Times</title><link>${origin}</link><description>Published source-linked news</description>${(await store.list({ limit: 100 })).map(a => `<item><guid isPermaLink="true">${origin}${articlePath(a)}</guid><link>${origin}${articlePath(a)}</link><title>${escapeHtml(a.title)}</title><description>${escapeHtml(a.aiSummary)}</description><pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate></item>`).join("")}</channel></rss>`));
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err instanceof ArticleValidationError ? 400 : err.type === "entity.too.large" ? 413 : err instanceof SyntaxError && "body" in err ? 400 : (err.code === "SQLITE_CONSTRAINT_UNIQUE" || err.code === 11000 || err.name === "NewsConflictError") ? 409 : 500;
    if (status === 500) console.error("Request failed:", err.name || "Error");
    res.status(status).json({ error: status === 500 ? "The request could not be saved" : status === 409 && err.name !== "NewsConflictError" ? "An article with this source URL already exists" : err.message });
  });
  return { app, store, origin };
}

export async function createProductionApp() {
  const store = await createConfiguredStore();
  let jobs: MongoNewsJobs | undefined;
  if (store instanceof MongoNewsStore) {
    jobs = new MongoNewsJobs(store.client, store.db);
    await jobs.ready();
    await new Publishers(store.db).seed();
  }
  const context = createApp(store, jobs);
  mountPages(context.app, store, context.origin);
  return { ...context, jobs };
}

export function mountPages(app: express.Express, store: NewsStoreAdapter, origin: string, vite?: any) {
  if (!vite && process.env.VERCEL !== "1") {
    app.use("/assets", express.static(path.resolve("dist/client/assets"), { index: false, maxAge: "1y", immutable: true }));
    app.get(/\.(?:png|jpe?g|svg|ico|webp|woff2?)$/i, express.static(path.resolve("dist/client"), { index: false }));
  }
  app.get("*", async (req, res, next) => {
    try {
      const url = new URL(req.originalUrl, origin);
      const match = url.pathname.match(/^\/article\/([^/]+)$/);
      const article = match ? await store.get(decodeURIComponent(match[1])) : undefined;
      if (article && url.pathname !== articlePath(article)) { res.redirect(301, articlePath(article)); return; }
      const template = await fs.readFile(path.resolve(vite ? "index.html" : "dist/client/index.html"), "utf8");
      const transformed = vite ? await vite.transformIndexHtml(req.originalUrl, template) : template;
      const result = await renderPage(transformed, url.pathname, store, origin);
      if (result.noindex) res.setHeader("X-Robots-Tag", "noindex, follow");
      res.status(result.status).type("html").send(result.html);
    } catch (e) { next(e); }
  });
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Page render failed:", error.name || "Error");
    res.status(500).type("text/plain").send("Page temporarily unavailable");
  });
}

export async function startServer() {
  const production = process.env.NODE_ENV === "production" || process.argv[1]?.endsWith("server.mjs");
  const store = await createConfiguredStore();
  let jobs: MongoNewsJobs | undefined;
  if (store instanceof MongoNewsStore) { jobs = new MongoNewsJobs(store.client, store.db); await jobs.ready(); }
  const { app, origin } = createApp(store, jobs);
  let vite: any;
  if (!production) {
    const { createServer } = await import("vite");
    vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
    app.use(vite.middlewares);
  }
  mountPages(app, store, origin, vite);
  if (process.env.VERCEL === "1") throw new Error("Use the Vercel request handler; no background web process is supported there");
  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, process.env.HOST || "127.0.0.1", () => console.log(`The Atlas Times listening on port ${port}`));
  const shutdown = () => { server.close(() => { void store.close(); void vite?.close(); }); };
  process.once("SIGTERM", shutdown); process.once("SIGINT", shutdown);
  return server;
}
if (!process.env.VERCEL && process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) startServer().catch(e => { console.error("Server initialization failed:", e.name); process.exitCode = 1; });
