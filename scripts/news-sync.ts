import { config } from "dotenv";
config({ path: [process.env.ATLAS_ENV_FILE || ".env.local", ".env"], quiet: true });
import fs from "node:fs/promises";
const [action, filename] = process.argv.slice(2);
if (!["pull", "push"].includes(action) || !filename) throw new Error("Usage: npm run news:sync -- pull|push /secure/path/news.json");
const base = new URL(process.env.ATLAS_API_URL || (process.env.DGX_GATEWAY_KEY ? "http://127.0.0.1:3011" : "http://127.0.0.1:3000"));
if (!["http:", "https:"].includes(base.protocol)) throw new Error("ATLAS_API_URL must use HTTP or HTTPS");
if (base.protocol !== "https:" && !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) throw new Error("Remote news connections require HTTPS");
if (base.username || base.password || base.search || base.hash) throw new Error("ATLAS_API_URL must not contain credentials, a query or a fragment");
const gatewayHeaders = process.env.DGX_GATEWAY_KEY ? { "X-Atlas-Gateway-Key": process.env.DGX_GATEWAY_KEY } : {};
if (action === "pull") {
  const data = [];
  for (let page = 1; ; page++) {
    const response = await fetch(new URL(`/api/news?limit=1000&page=${page}`, base), { headers: gatewayHeaders, redirect: "manual", signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Pull failed (HTTP ${response.status})`);
    const result = await response.json() as { data: unknown[] }; data.push(...result.data);
    if (result.data.length < 1000) break;
  }
  await fs.writeFile(filename, JSON.stringify({ data }, null, 2), { mode: 0o600, flag: "wx" });
  console.log(`Pulled ${data.length} published articles.`);
} else {
  const key = process.env.NEWS_INGEST_KEY;
  if (!key || key.length < 32) throw new Error("Set NEWS_INGEST_KEY for draft-only pushes");
  const input = JSON.parse(await fs.readFile(filename, "utf8"));
  const rows = Array.isArray(input) ? input : input.data;
  if (!Array.isArray(rows)) throw new Error("Input must be an article array or {data:[...]}");
  let pushed = 0, duplicates = 0;
  for (const row of rows) {
    if (!row.originalUrl || !/^https?:\/\//.test(row.originalUrl)) throw new Error("Remote draft pushes require a source URL for durable retry deduplication. Use local news:import for legacy editorial records.");
    const response = await fetch(new URL("/api/news", base), { method: "POST", redirect: "manual", signal: AbortSignal.timeout(30000), headers: { ...gatewayHeaders, "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ ...row, status: "draft" }) });
    if (!response.ok) throw new Error(`Push failed (HTTP ${response.status}); rerun safely after resolving the error`);
    const result = await response.json() as { duplicate?: boolean }; if (result.duplicate) duplicates++; else pushed++;
  }
  console.log(JSON.stringify({ pushed, duplicates, publicationStatus: "draft" }));
}
