import type { NewsStoreAdapter } from "./store-types";
import { MongoNewsStore } from "./mongo-news-store";

export async function createConfiguredStore(): Promise<NewsStoreAdapter> {
  if (process.env.MONGODB_URI) {
    const store = new MongoNewsStore(process.env.MONGODB_URI, process.env.MONGODB_DB_NAME || "the_atlas_times");
    await store.initialize();
    return store;
  }
  if (process.env.VERCEL === "1" || (process.env.NODE_ENV === "production" && process.env.NEWS_STORAGE !== "sqlite")) {
    throw new Error("Configure MONGODB_URI before deploying. Production cannot fall back to an empty local news database.");
  }
  const { NewsStore } = await import("./news-store");
  return new NewsStore();
}
