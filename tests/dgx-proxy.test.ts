import test from "node:test";
import assert from "node:assert/strict";
import { proxyToDgx } from "../api/dgx-proxy.js";

test("Vercel gateway keeps requests on the fixed DGX origin and replaces untrusted forwarding credentials", async () => {
  const previous = { origin: process.env.DGX_ORIGIN, key: process.env.DGX_GATEWAY_KEY, fetch: globalThis.fetch };
  process.env.DGX_ORIGIN = "https://dgx.example:8443"; process.env.DGX_GATEWAY_KEY = "a".repeat(64);
  let called = false;
  globalThis.fetch = (async (url: URL, options: RequestInit) => {
    called = true; assert.equal(url.origin, "https://dgx.example:8443"); assert.equal(url.pathname, "/api/news");
    const headers = new Headers(options.headers);
    assert.equal(headers.get("x-atlas-gateway-key"), "a".repeat(64));
    assert.equal(headers.get("x-atlas-client-ip"), "198.51.100.1");
    assert.equal(headers.get("x-forwarded-for"), null); assert.equal(headers.get("cookie"), "session=test");
    assert.equal(options.redirect, "manual");
    return new Response('{"data":[]}', { status: 200, headers: { "Content-Type": "application/json", "Set-Cookie": "__Host-atlas_editor=test; Secure; HttpOnly; Path=/" } });
  }) as typeof fetch;
  const output: { body?: Buffer; headers: Record<string, unknown>; statusCode?: number } = { headers: {} };
  const res = { setHeader: (name: string, value: unknown) => { output.headers[name] = value; }, end: (body: Buffer) => { output.body = body; }, set statusCode(value: number) { output.statusCode = value; } };
  try {
    await proxyToDgx({ url: "https://attacker.example/api/news?limit=1", method: "GET", headers: { "x-real-ip": "198.51.100.1", "x-atlas-gateway-key": "attacker", "x-atlas-client-ip": "attacker", "x-forwarded-for": "attacker", cookie: "session=test" } }, res);
    assert.equal(called, true); assert.equal(output.statusCode, 200); assert.equal(output.body?.toString(), '{"data":[]}');
    assert.ok(output.headers["Set-Cookie"]);
  } finally {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of Object.entries({ DGX_ORIGIN: previous.origin, DGX_GATEWAY_KEY: previous.key })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test("Vercel gateway forwards parsed JSON and unconsumed request bodies", async () => {
  const previous = { origin: process.env.DGX_ORIGIN, key: process.env.DGX_GATEWAY_KEY, fetch: globalThis.fetch };
  process.env.DGX_ORIGIN = "https://dgx.example:8443"; process.env.DGX_GATEWAY_KEY = "a".repeat(64);
  const bodies: unknown[] = [];
  globalThis.fetch = (async (_url: URL, options: RequestInit) => {
    bodies.push(options.body);
    assert.equal(options.method, "POST");
    assert.equal(new Headers(options.headers).get("content-type"), "application/json");
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  const res = { setHeader: () => {}, end: () => {}, statusCode: 0 };
  try {
    const base = { url: "/api/auth/login", method: "POST", headers: { "content-type": "application/json" } };
    await proxyToDgx({ ...base, body: { username: "editor", password: "example" } }, res);
    const stream = { ...base }; await proxyToDgx(stream, res);
    assert.deepEqual(JSON.parse(String(bodies[0])), { username: "editor", password: "example" });
    assert.equal(bodies[1], stream);
  } finally {
    globalThis.fetch = previous.fetch;
    for (const [key, value] of Object.entries({ DGX_ORIGIN: previous.origin, DGX_GATEWAY_KEY: previous.key })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
