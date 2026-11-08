#!/usr/bin/env bash
# Read-only DGX Times diagnostics: no database writes, container restarts, or secret output.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
compose=(docker compose --env-file .env.dgx -f compose.dgx.yaml)
if [[ "${1:-}" == "--probe" ]]; then
  "${compose[@]}" exec -T worker node --input-type=module <<'NODE'
const base = process.env.AI_BASE_URL || "";
const model = process.env.AI_MODEL || "";
const headers = { "Content-Type": "application/json", ...(process.env.AI_API_KEY ? { Authorization: "Bearer " + process.env.AI_API_KEY } : {}) };
const err = (type, message) => { console.error(JSON.stringify({ phase: type, failure: String(message).slice(0,250) })); process.exitCode = 1; };
try {
  if (process.env.AI_PROVIDER !== "openai" || !base || !model) throw Error("Worker has no configured OpenAI-compatible DGX model");
  const url = new URL(base.replace(/\/$/, "") + "/");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw Error("Model URL is not loopback; refuse diagnostics");
  const listed = await fetch(new URL("models",url), { headers, signal: AbortSignal.timeout(20000) });
  if (!listed.ok) throw Error("Model discovery returned HTTP " + listed.status);
  const models = (await listed.json()).data?.map(m => m.id) || [];
  const match = models.includes(model);
  console.log(JSON.stringify({ phase: "model", workerModel: model, availableModels: models, modelMatches: match }));
  if (!match) throw Error("AI_MODEL is not the exact served model ID");
  const body = {
    model, temperature: 0.1, max_tokens: 800,
    ...(process.env.AI_JSON_MODE === "true" ? { response_format: { type: "json_object" } } : {}),
    ...(process.env.AI_DISABLE_THINKING === "true" ? { chat_template_kwargs: { enable_thinking: false } } : {}),
    messages: [
      { role: "system", content: "Return ONLY a JSON object with keyPoints (array of 1 string), whyItMatters (string), detailedHumanizedSummary (string). No markdown." },
      { role: "user", content: "Fictional diagnostic fixture: a library changes its closing time to 20:00 on Friday. No attendance or impact data is available. Summarize only this fact." },
    ],
  };
  const started = Date.now();
  const resp = await fetch(new URL("chat/completions",url), { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  if (!resp.ok) throw Error("Inference returned HTTP " + resp.status);
  const json = await resp.json();
  const raw = json?.choices?.[0]?.message?.content;
  if (typeof raw !== "string") throw Error("Inference content missing or not text");
  let parsed;
  try { parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")); }
  catch { throw Error("Inference returned invalid JSON"); }
  const ok = Array.isArray(parsed?.keyPoints) && parsed.keyPoints.length > 0 && typeof parsed.whyItMatters === "string" && typeof parsed.detailedHumanizedSummary === "string";
  if (!ok) throw Error("Inference returned JSON without required article-analysis fields");
  console.log(JSON.stringify({ phase: "inference", status: "passed", durationSeconds: Math.round((Date.now()-started)/1000), finishReason: json?.choices?.[0]?.finish_reason, publication: "not written" }));
} catch (error) {
  err("probe", error?.name === "TimeoutError" ? "Timed out contacting the DGX model" : error?.message || "Unknown inference failure");
}
NODE
else
  "${compose[@]}" exec -T worker node --input-type=module <<'NODE'
import { MongoClient } from "mongodb";
const uri = process.env.MONGODB_URI;
const name = process.env.MONGODB_DB_NAME || "the_atlas_times";
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 12000 });
try {
  await client.connect();
  const db = client.db(name);
  const jobs = db.collection("news_analysis_jobs");
  const statusCounts = await jobs.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray();
  const errors = await jobs.find({ lastError: { $exists: true } })
    .sort({ updatedAt: -1 }).limit(12)
    .project({ _id: 0, id: 1, status: 1, attempts: 1, maxAttempts: 1, updatedAt: 1, lastError: 1 }).toArray();
  const recentSuccess = await jobs.find({ status: "succeeded" })
    .sort({ updatedAt: -1 }).limit(3)
    .project({ _id: 0, status: 1, updatedAt: 1, finishedAt: 1 }).toArray();
  const ingestion = await db.collection("news_ingestion_runs").find({})
    .sort({ _id: -1 }).limit(5)
    .project({ _id: 1, status: 1, attempts: 1, finishedAt: 1, "result.inserted": 1, "result.skipped": 1, "result.errors": 1 }).toArray();
  const heldReasons = await db.collection("news_articles").aggregate([
    { $match: { status: "draft", "article.automationCheck.verdict": "held" } },
    { $group: { _id: "$article.automationCheck.reason", count: { $sum: 1 } } },
    { $sort: { count: -1 } }, { $limit: 8 },
  ]).toArray();
  console.log(JSON.stringify({
    configuration: { provider: process.env.AI_PROVIDER, workerModel: process.env.AI_MODEL, jsonMode: process.env.AI_JSON_MODE, disableThinking: process.env.AI_DISABLE_THINKING, ingestionEnabled: process.env.ENABLE_INGESTION, autoPublish: process.env.AUTO_PUBLISH },
    statusCounts, recentErrors: errors, recentSuccess, ingestion, topHeldReasons: heldReasons,
  }, null, 2));
} catch (error) {
  console.error("DGX Times diagnosis failed:", error instanceof Error ? error.name : "UnknownError");
  process.exitCode = 1;
} finally {
  await client.close();
}
NODE
fi
