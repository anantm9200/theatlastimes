import { config } from "dotenv";
config({ path: [".env.migration", ".env.dgx"], quiet: true });
import { MongoClient } from "mongodb";
if (!process.env.LEGACY_MONGODB_URI || !process.env.MONGODB_URI) throw new Error("Configure separate source and destination MongoDB URIs");
if (process.env.LEGACY_MONGODB_URI === process.env.MONGODB_URI) throw new Error("Source and destination must differ");
const sourceClient = new MongoClient(process.env.LEGACY_MONGODB_URI), targetClient = new MongoClient(process.env.MONGODB_URI);
try {
  await sourceClient.connect(); await targetClient.connect();
  const source = sourceClient.db(process.env.LEGACY_MONGODB_DB_NAME || "the_atlas_times_preview"), target = targetClient.db(process.env.MONGODB_DB_NAME || "the_atlas_times");
  // Imports run only against empty destination collections. Never overwrite a
  // store which may already contain newer editorial changes.
  const collections = ["news_articles", "news_identifiers", "news_audit", "news_counters"];
  for (const name of collections) if (await target.collection(name).countDocuments()) throw new Error("Destination is not empty; migration refused");
  const counts: Record<string, number> = {};
  await targetClient.withSession(session => session.withTransaction(async () => {
    for (const name of collections) {
      const rows = await source.collection(name).find().toArray();
      if (rows.length) await target.collection(name).insertMany(rows, { session });
      counts[name] = rows.length;
    }
  }));
  for (const name of collections) if (await target.collection(name).countDocuments() !== counts[name]) throw new Error("Migration verification failed");
  console.log(JSON.stringify({ migrated: counts, published: await target.collection("news_articles").countDocuments({ status: "published" }) }));
} finally { await sourceClient.close(); await targetClient.close(); }
