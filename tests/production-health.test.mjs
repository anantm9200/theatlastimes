import test from "node:test";
import assert from "node:assert/strict";
import { inspectProduction } from "../scripts/production-health.mjs";

const clock = Date.parse("2026-11-08T12:00:00.000Z");
function fakeFetch({ health = { status: "ok", storage: "ready" }, latest = "2026-11-08T10:00:00Z", status = 200 } = {}) {
  return async (url) => ({
    ok: status >= 200 && status < 300,
    status,
    url: String(url),
    text: async () => JSON.stringify(String(url).includes("api/health") ?
      health : { data: [{ title: "A source-backed article", publishedAt: latest, generatedBy: "qwen3.8:27b" }] }),
  });
}

test("healthy DGX gateway and fresh publication", async () => {
  const outcome = await inspectProduction({ now: clock, fetcher: fakeFetch() });
  assert.equal(outcome.status, "healthy");
  assert.equal(outcome.ok, true);
  assert.equal(outcome.ageHours, 2);
});

test("available gateway with stale publication is diagnosed separately", async () => {
  const outcome = await inspectProduction({ now: clock, maxAgeHours: 48, fetcher: fakeFetch({ latest: "2026-11-05T01:00:00Z" }) });
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.ok, false);
  assert.match(outcome.message, /worker, source ingestion, and editorial holds/);
});

test("rejects unavailable storage", async () => {
  await assert.rejects(inspectProduction({ fetcher: fakeFetch({ health: { status: "ok", storage: "unavailable" } }) }), /storage is unavailable/);
});

test("rejects unexpected HTTP failures", async () => {
  await assert.rejects(inspectProduction({ fetcher: fakeFetch({ status: 503 }) }), /HTTP 503/);
});

test("rejects non-HTTPS endpoint", async () => {
  await assert.rejects(inspectProduction({ baseUrl: "http://127.0.0.1:3000", fetcher: fakeFetch() }), /HTTPS origin/);
});

test("rejects future publication timestamps", async () => {
  await assert.rejects(inspectProduction({ now: clock, fetcher: fakeFetch({ latest: "2026-11-09T20:00:00Z" }) }), /in the future/);
});
