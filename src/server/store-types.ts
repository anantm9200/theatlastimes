import type { Article } from "../types/index.ts";
import type { NewsAuditEvent, NewsListOptions } from "./news-store.ts";

export type { NewsAuditEvent, NewsListOptions };
export type Awaitable<T> = T | Promise<T>;

/** The HTTP application supports local SQLite and shared MongoDB with the same contract. */
export interface NewsStoreAdapter {
  initialize?(): Promise<void>;
  list(options?: NewsListOptions): Awaitable<Article[]>;
  get(idOrSlug: string, includeUnpublished?: boolean): Awaitable<Article | undefined>;
  count(status?: "published" | "draft" | "archived"): Awaitable<number>;
  save(article: Article, actor?: string, expectedModifiedAt?: string): Awaitable<Article>;
  delete(idOrSlug: string, actor?: string): Awaitable<boolean>;
  audit(limit?: number): Awaitable<NewsAuditEvent[]>;
  addAlias(alias: string, articleId: string): Awaitable<void>;
  close(): Awaitable<void>;
  backup?(destination: string): Promise<void>;
}

export class NewsConflictError extends Error {
  constructor(message = "The article changed. Reload it before saving.") {
    super(message);
    this.name = "NewsConflictError";
  }
}
