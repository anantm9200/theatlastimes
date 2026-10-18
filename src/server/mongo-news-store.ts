import { MongoClient, type ClientSession, type Collection, type Db, type Filter } from "mongodb";
import type { Article } from "../types/index.ts";
import { ArticleValidationError, normalizeSourceUrl, validateArticle } from "./news-validation.ts";
import { NewsConflictError, type NewsAuditEvent, type NewsListOptions, type NewsStoreAdapter } from "./store-types.ts";

interface ArticleDocument {
  _id: string;
  slug: string;
  originalUrl?: string;
  category: string;
  region: string;
  title: string;
  summary: string;
  status: NonNullable<Article["status"]>;
  sortAt: string;
  revision: number;
  article: Article;
}
interface Identifier { _id: string; articleId: string }
interface Counter { _id: string; sequence: number }
interface AuditDocument extends NewsAuditEvent { _id?: import("mongodb").ObjectId }
const literalRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const bounded = (value: number | undefined, fallback: number, maximum: number) => Number.isFinite(value) ? Math.min(maximum, Math.max(1, Math.floor(value!))) : fallback;
const copy = (article: Article): Article => JSON.parse(JSON.stringify(article)) as Article;

/** Shared authoritative store. Atlas/replica-set transactions include each audit event. */
export class MongoNewsStore implements NewsStoreAdapter {
  readonly client: MongoClient;
  readonly database: Db;
  readonly db: Db;
  private readonly articles: Collection<ArticleDocument>;
  private readonly identifiers: Collection<Identifier>;
  private readonly events: Collection<AuditDocument>;
  private readonly counters: Collection<Counter>;
  private initialization?: Promise<void>;

  constructor(uri = process.env.MONGODB_URI, dbName = process.env.MONGODB_DB_NAME || "the_atlas_times") {
    if (!uri || !/^mongodb(?:\+srv)?:\/\//.test(uri)) throw new Error("MONGODB_URI is required and must be a MongoDB connection string");
    if (!/^[a-zA-Z0-9_-]{1,63}$/.test(dbName)) throw new Error("MONGODB_DB_NAME must contain only letters, numbers, underscores, or hyphens");
    this.client = new MongoClient(uri, { appName: "the-atlas-times", maxPoolSize: 10, maxIdleTimeMS: 60_000, serverSelectionTimeoutMS: 15_000 });
    this.database = this.client.db(dbName);
    this.db = this.database;
    this.articles = this.database.collection<ArticleDocument>("news_articles");
    this.identifiers = this.database.collection<Identifier>("news_identifiers");
    this.events = this.database.collection<AuditDocument>("news_audit");
    this.counters = this.database.collection<Counter>("news_counters");
  }

  initialize(): Promise<void> {
    if (!this.initialization) this.initialization = this.prepare().catch(error => { this.initialization = undefined; throw error; });
    return this.initialization;
  }

  private async prepare(): Promise<void> {
    await this.client.connect();
    const hello = await this.database.admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== "isdbgrid") throw new Error("MongoDB must be an Atlas cluster, replica set, or mongos supporting transactions");
    await this.articles.createIndexes([
      { key: { slug: 1 }, name: "news_slug_unique", unique: true },
      { key: { originalUrl: 1 }, name: "news_source_unique", unique: true, partialFilterExpression: { originalUrl: { $type: "string" } } },
      { key: { status: 1, sortAt: -1, _id: 1 }, name: "news_publication" },
      { key: { status: 1, category: 1, sortAt: -1 }, name: "news_category" },
    ]);
    await this.identifiers.createIndex({ articleId: 1 }, { name: "news_identifier_owner" });
    await this.events.createIndex({ id: -1 }, { unique: true, name: "news_audit_sequence" });
    await this.counters.updateOne({ _id: "news-audit" }, { $setOnInsert: { sequence: 0 } }, { upsert: true });
  }

  async list(options: NewsListOptions = {}): Promise<Article[]> {
    await this.initialize();
    const filter: Filter<ArticleDocument> = {};
    const status = options.status || "published";
    if (status !== "all") filter.status = status;
    if (options.category) filter.category = options.category.toLowerCase();
    if (options.region && options.region.toLowerCase() !== "global") filter.region = options.region.toLowerCase();
    if (options.search) {
      const term = { $regex: literalRegex(options.search.slice(0, 200)), $options: "i" };
      filter.$or = [{ title: term }, { summary: term }];
    }
    const offset = Number.isFinite(options.offset) ? Math.max(0, Math.floor(options.offset!)) : 0;
    const docs = await this.articles.find(filter).sort({ sortAt: -1, _id: 1 }).skip(offset).limit(bounded(options.limit, 100, 1000)).toArray();
    return docs.map(document => copy(document.article));
  }

  private async find(identifier: string, session?: ClientSession): Promise<ArticleDocument | null> {
    const direct = await this.articles.findOne({ _id: identifier }, { session });
    if (direct) return direct;
    const alias = await this.identifiers.findOne({ _id: identifier }, { session });
    return alias ? this.articles.findOne({ _id: alias.articleId }, { session }) : null;
  }

  async get(idOrSlug: string, includeUnpublished = false): Promise<Article | undefined> {
    await this.initialize();
    const found = await this.find(idOrSlug);
    return found && (includeUnpublished || found.status === "published") ? copy(found.article) : undefined;
  }

  async count(status: "published" | "draft" | "archived" = "published"): Promise<number> {
    await this.initialize();
    return this.articles.countDocuments({ status });
  }

  private async reserve(identifier: string, articleId: string, session: ClientSession): Promise<void> {
    const existing = await this.identifiers.findOne({ _id: identifier }, { session });
    if (existing && existing.articleId !== articleId) throw new NewsConflictError("This article ID, slug, or legacy alias belongs to another article");
    if (!existing) await this.identifiers.insertOne({ _id: identifier, articleId }, { session });
  }

  private async record(article: Article, action: NewsAuditEvent["action"], actor: string, session: ClientSession, previousStatus?: Article["status"]): Promise<void> {
    const counter = await this.counters.findOneAndUpdate({ _id: "news-audit" }, { $inc: { sequence: 1 } }, { session, returnDocument: "after" });
    if (!counter) throw new Error("News audit sequence is not initialized");
    await this.events.insertOne({ id: counter.sequence, articleId: article.id, action, actor: actor.slice(0, 250), occurredAt: article.modifiedAt || new Date().toISOString(), ...(previousStatus ? { previousStatus } : {}), ...(action !== "delete" ? { status: article.status } : {}) }, { session });
  }

  private async transaction<T>(action: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = this.client.startSession();
    try {
      return await session.withTransaction(() => action(session), { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary", maxCommitTimeMS: 15000 }) as T;
    } finally { await session.endSession(); }
  }

  private async saveInside(article: Article, actor: string, session: ClientSession, expectedModifiedAt?: string): Promise<Article | undefined> {
    let existing = await this.find(article.id, session);
    const originalUrl = normalizeSourceUrl(article.originalUrl);
    if (originalUrl) {
      const duplicate = await this.articles.findOne({ originalUrl }, { session });
      if (duplicate) {
        if (existing && duplicate._id !== existing._id) throw new NewsConflictError("The source URL belongs to another article");
        existing = duplicate;
      }
    }
    if (expectedModifiedAt !== undefined && (!existing || existing.article.modifiedAt !== expectedModifiedAt)) return undefined;
    if (existing && article.status === "draft" && existing.status !== "draft" && /^(rss|service:ingest)/.test(actor)) return copy(existing.article);
    const clean = validateArticle(article, existing?.article);
    if (!existing && !originalUrl) {
      if (!/^editorial-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(article.id) || !/^[a-z0-9-]{1,160}$/.test(article.slug)) throw new ArticleValidationError("Save a validated article with a generated editorial ID and slug");
      clean.id = article.id; clean.slug = article.slug;
    }
    clean.modifiedAt = new Date(Math.max(Date.now(), Date.parse(existing?.article.modifiedAt || "") + 1 || 0)).toISOString();
    const document: ArticleDocument = {
      _id: clean.id, slug: clean.slug, ...(originalUrl ? { originalUrl } : {}), title: clean.title,
      summary: clean.aiSummary || "", category: clean.category.toLowerCase(), region: clean.region.toLowerCase(),
      status: clean.status!, sortAt: clean.publishedAt || clean.modifiedAt, revision: (existing?.revision || 0) + 1, article: copy(clean),
    };
    if (existing) {
      const changed = await this.articles.replaceOne({ _id: existing._id, revision: existing.revision }, document, { session });
      if (!changed.matchedCount) return undefined;
    } else {
      await this.reserve(clean.id, clean.id, session);
      await this.reserve(clean.slug, clean.id, session);
      await this.articles.insertOne(document, { session });
    }
    await this.record(clean, existing ? "update" : "create", actor, session, existing?.status);
    return copy(clean);
  }

  async save(article: Article, actor = "system", expectedModifiedAt?: string): Promise<Article> {
    await this.initialize();
    const result = await this.transaction(session => this.saveInside(article, actor, session, expectedModifiedAt));
    if (!result) throw new NewsConflictError();
    return result;
  }

  async compareAndSave(article: Article, actor: string, expectedModifiedAt: string, session?: ClientSession): Promise<Article | undefined> {
    await this.initialize();
    return session ? this.saveInside(article, actor, session, expectedModifiedAt) : this.transaction(active => this.saveInside(article, actor, active, expectedModifiedAt));
  }

  async addAlias(alias: string, articleId: string): Promise<void> {
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(alias)) throw new ArticleValidationError("Invalid legacy alias");
    await this.initialize();
    await this.transaction(async session => {
      if (!await this.articles.findOne({ _id: articleId }, { session })) throw new ArticleValidationError("The alias article does not exist");
      await this.reserve(alias, articleId, session);
    });
  }

  async delete(idOrSlug: string, actor = "system"): Promise<boolean> {
    await this.initialize();
    return this.transaction(async session => {
      const existing = await this.find(idOrSlug, session);
      if (!existing) return false;
      await this.articles.deleteOne({ _id: existing._id, revision: existing.revision }, { session });
      await this.identifiers.deleteMany({ articleId: existing._id }, { session });
      await this.record({ ...existing.article, modifiedAt: new Date().toISOString() }, "delete", actor, session, existing.status);
      return true;
    });
  }

  async audit(limit = 100): Promise<NewsAuditEvent[]> {
    await this.initialize();
    return this.events.find({}, { projection: { _id: 0 } }).sort({ id: -1 }).limit(bounded(limit, 100, 1000)).toArray();
  }

  async close(): Promise<void> { await this.client.close(); }
}
