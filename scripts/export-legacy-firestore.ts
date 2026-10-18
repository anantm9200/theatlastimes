import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });
import fs from "node:fs/promises";
import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
const destination = process.argv[2];
if (!destination) throw new Error("Pass an output JSON path. Uses Application Default Credentials for read-only export.");
const configFile = JSON.parse(await fs.readFile("firebase-applet-config.json", "utf8"));
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) : undefined;
const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccount?.project_id || configFile.projectId;
const app = initializeApp({ credential: serviceAccount ? cert(serviceAccount) : applicationDefault(), projectId }, "legacy-export");
const databaseId = process.env.LEGACY_FIREBASE_DATABASE_ID || (projectId === configFile.projectId ? configFile.firestoreDatabaseId : undefined) || "(default)";
const db = getFirestore(app, databaseId);
let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
const articles: unknown[] = [];
while (true) {
  let query = db.collection("articles").orderBy("__name__").limit(500);
  if (cursor) query = query.startAfter(cursor);
  const snap = await query.get();
  if (snap.empty) break;
  articles.push(...snap.docs.map(d => ({ ...d.data(), id: d.id })));
  cursor = snap.docs.at(-1);
}
await fs.writeFile(destination, JSON.stringify({ data: articles }, null, 2), { mode: 0o600, flag: "wx" });
console.log(`Exported ${articles.length} legacy records. Keep this private and import as drafts for review.`);
