import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });
import { aiConfiguration, analyzeArticle } from "../src/server/ai";
import { validateArticle } from "../src/server/news-validation";
const status = aiConfiguration();
if (!status.configured) throw new Error("Set AI_PROVIDER=openai, AI_BASE_URL, AI_MODEL and optional AI_API_KEY");
if (status.provider === "openai") {
  const base = process.env.AI_BASE_URL!.replace(/\/$/, "");
  const response = await fetch(`${base}/models`, { signal: AbortSignal.timeout(15000), headers: process.env.AI_API_KEY ? { Authorization: `Bearer ${process.env.AI_API_KEY}` } : {} });
  if (!response.ok) throw new Error(`Model discovery failed (HTTP ${response.status})`);
  const result = await response.json() as { data?: { id: string }[] };
  console.log(JSON.stringify({ availableModels: result.data?.map(model => model.id) || [] }));
}
if (process.argv.includes("--generate")) {
  const started = Date.now();
  const result = await analyzeArticle(validateArticle({ title: "Test library announces evening opening", summary: "In this fictional test fixture, a library will open until 20:00 on Fridays starting next month. No attendance estimates were supplied.", sourceName: "Integration test fixture", originalUrl: "https://example.com/test-fixture" }));
  console.log(JSON.stringify({ inference: "passed", elapsedSeconds: (Date.now() - started) / 1000, fields: Object.keys(result), publicationStatus: "not saved" }));
}
