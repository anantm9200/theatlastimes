import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { Article } from "../types/index.ts";
import { ArticleValidationError, normalizeSourceUrl, validateArticle } from "./news-validation.ts";

export interface NewsListOptions {
  status?: Article["status"] | "all";
  category?: string;
  region?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface NewsAuditEvent {
  id: number;
  articleId: string;
  action: "create" | "update" | "delete";
  actor: string;
  occurredAt: string;
  previousStatus?: Article["status"];
  status?: Article["status"];
}

/** One authoritative store: publication and its audit event commit atomically. */
export class NewsStore {
  private readonly db: Database.Database;

  constructor(dbPath = process.env.NEWS_DB_PATH || "data/news.db") {
    if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        original_url TEXT UNIQUE,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        region TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('draft', 'published', 'archived')),
        published_at TEXT,
        modified_at TEXT NOT NULL,
        json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS articles_publication ON articles(status, published_at DESC);
      CREATE INDEX IF NOT EXISTS articles_category ON articles(status, category COLLATE NOCASE);
      CREATE TABLE IF NOT EXISTS article_aliases (
        alias TEXT PRIMARY KEY,
        article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS news_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        article_id TEXT NOT NULL,
        action TEXT NOT NULL,
        actor TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        previous_status TEXT,
        status TEXT
      );
    `);
  }

  list(options: NewsListOptions = {}): Article[] {
    const { status = "published", category, region, search } = options;
    const conditions: string[] = [];
    const args: (string | number)[] = [];
    if (status !== "all") { conditions.push("status = ?"); args.push(status); }
    if (category) { conditions.push("category = ? COLLATE NOCASE"); args.push(category); }
    if (region && region.toLowerCase() !== "global") { conditions.push("region = ? COLLATE NOCASE"); args.push(region); }
    if (search) {
      // Escape wildcard characters so a literal user query cannot match all rows.
      const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
      conditions.push("(title LIKE ? ESCAPE '\\' OR json_extract(json, '$.aiSummary') LIKE ? ESCAPE '\\')");
      args.push(pattern, pattern);
    }
    const limit = Number.isFinite(options.limit) ? Math.min(1000, Math.max(1, Math.floor(options.limit!))) : 100;
    const offset = Number.isFinite(options.offset) ? Math.max(0, Math.floor(options.offset!)) : 0;
    const rows = this.db.prepare(`SELECT json FROM articles ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
      ORDER BY COALESCE(published_at, modified_at) DESC, id ASC LIMIT ? OFFSET ?`).all(...args, limit, offset) as { json: string }[];
    return rows.map((row) => JSON.parse(row.json) as Article);
  }

  get(idOrSlug: string, includeUnpublished = false): Article | undefined {
    const row = this.db.prepare(`SELECT json FROM articles WHERE (id = ? OR slug = ? OR id = (SELECT article_id FROM article_aliases WHERE alias = ?)) ${includeUnpublished ? "" : "AND status = 'published'"} LIMIT 1`)
      .get(idOrSlug, idOrSlug, idOrSlug) as { json: string } | undefined;
    return row ? JSON.parse(row.json) as Article : undefined;
  }

  count(status: "published" | "draft" | "archived" = "published"): number {
    return (this.db.prepare("SELECT count(*) AS count FROM articles WHERE status = ?").get(status) as { count: number }).count;
  }

  addAlias(alias: string, articleId: string): void {
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(alias)) throw new ArticleValidationError("Invalid legacy alias");
    const conflicting = this.get(alias, true);
    if (conflicting && conflicting.id !== articleId) throw new ArticleValidationError("Legacy alias already belongs to another article");
    this.db.prepare("INSERT INTO article_aliases(alias, article_id) VALUES (?, ?) ON CONFLICT(alias) DO NOTHING").run(alias, articleId);
  }

  save(article: Article, actor = "system"): Article {
    return this.db.transaction(() => {
      let existing = this.get(article.id, true);
      const originalUrl = normalizeSourceUrl(article.originalUrl);
      if (originalUrl) {
        const duplicate = this.db.prepare("SELECT json FROM articles WHERE original_url = ?").get(originalUrl) as { json: string } | undefined;
        if (duplicate) {
          const sourceArticle = JSON.parse(duplicate.json) as Article;
          if (existing && sourceArticle.id !== existing.id) throw new ArticleValidationError("The source URL belongs to another article");
          existing = sourceArticle;
        }
      }
      // Repeated ingestion must never overwrite an editor's published/archived work.
      if (existing && article.status === "draft" && existing.status !== "draft" && /^(rss|service:ingest)/.test(actor)) return existing;
      const clean = validateArticle(article, existing);
      if (!existing && !originalUrl) {
        if (!/^editorial-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(article.id)) {
          throw new ArticleValidationError("Save a validated article with a generated editorial ID");
        }
        clean.id = article.id;
        if (!/^[a-z0-9-]{1,160}$/.test(article.slug)) throw new ArticleValidationError("Article slug is invalid");
        clean.slug = article.slug;
      }
      this.db.prepare(`INSERT INTO articles(id, slug, original_url, title, category, region, status, published_at, modified_at, json)
        VALUES (@id, @slug, @originalUrl, @title, @category, @region, @status, @publishedAt, @modifiedAt, @json)
        ON CONFLICT(id) DO UPDATE SET title=excluded.title, category=excluded.category, region=excluded.region,
          status=excluded.status, published_at=excluded.published_at, modified_at=excluded.modified_at, json=excluded.json`).run({
        id: clean.id, slug: clean.slug, originalUrl: clean.originalUrl || null, title: clean.title, category: clean.category,
        region: clean.region, status: clean.status, publishedAt: clean.publishedAt || null, modifiedAt: clean.modifiedAt,
        json: JSON.stringify(clean),
      });
      this.db.prepare(`INSERT INTO news_audit(article_id, action, actor, occurred_at, previous_status, status) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(clean.id, existing ? "update" : "create", actor.slice(0, 250), clean.modifiedAt!, existing?.status || null, clean.status!);
      return JSON.parse(JSON.stringify(clean)) as Article;
    })();
  }

  delete(idOrSlug: string, actor = "system"): boolean {
    return this.db.transaction(() => {
      const existing = this.get(idOrSlug, true);
      if (!existing) return false;
      this.db.prepare("DELETE FROM articles WHERE id = ?").run(existing.id);
      this.db.prepare("INSERT INTO news_audit(article_id, action, actor, occurred_at, previous_status) VALUES (?, 'delete', ?, ?, ?)")
        .run(existing.id, actor.slice(0, 250), new Date().toISOString(), existing.status!);
      return true;
    })();
  }

  audit(limit = 100): NewsAuditEvent[] {
    return this.db.prepare(`SELECT id, article_id AS articleId, action, actor, occurred_at AS occurredAt,
      previous_status AS previousStatus, status FROM news_audit ORDER BY id DESC LIMIT ?`)
      .all(Number.isFinite(limit) ? Math.min(1000, Math.max(1, Math.floor(limit))) : 100) as NewsAuditEvent[];
  }

  async backup(destination: string): Promise<void> {
    fs.mkdirSync(path.dirname(path.resolve(destination)), { recursive: true });
    await this.db.backup(destination);
  }

  close(): void { this.db.close(); }
}
