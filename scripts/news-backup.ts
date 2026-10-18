import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });
import { NewsStore } from "../src/server/news-store";
if (process.env.MONGODB_URI || process.env.VERCEL === "1") throw new Error("news:backup is SQLite-only. Use Atlas backups or mongodump for MongoDB including jobs, aliases, and audit records.");
const destination = process.argv[2];
if (!destination) throw new Error("Usage: npm run news:backup -- /secure/path/news-backup.db");
const store = new NewsStore();
try { await store.backup(destination); console.log("Consistent database backup written."); } finally { store.close(); }
