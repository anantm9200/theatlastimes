import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { MongoNewsStore } from "../src/server/mongo-news-store";
import { passwordHash } from "../src/server/editor-sessions";
import { createApp } from "../server";

test("Mongo editor sessions enforce password, HttpOnly cookies, CSRF, revocation and password rotation without Firebase", { skip: !process.env.MONGODB_TEST_URI }, async () => {
  const keys = ["EDITOR_USERNAME", "EDITOR_PASSWORD_HASH", "NODE_ENV"], before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const password = "test-editor-password-1234567890";
  process.env.EDITOR_USERNAME = "test-editor"; process.env.EDITOR_PASSWORD_HASH = await passwordHash(password); process.env.NODE_ENV = "production";
  const store = new MongoNewsStore(process.env.MONGODB_TEST_URI!, `atlas_sessions_${crypto.randomUUID().replaceAll("-", "")}`);
  await store.initialize(); const { app } = createApp(store);
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const login = (value: string) => fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "test-editor", password: value }) });
    assert.equal((await login("invalid-password-but-long-enough")).status, 401);
    const response = await login(password), session = await response.json() as any, cookie = response.headers.get("set-cookie")!;
    assert.equal(response.status, 200); assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Strict/);
    const headers = { Cookie: cookie.split(";")[0], "Content-Type": "application/json" };
    assert.equal((await fetch(base + "/api/admin/news", { headers })).status, 200);
    assert.equal((await fetch(base + "/api/news", { method: "POST", headers, body: JSON.stringify({ title: "CSRF attempt" }) })).status, 403);
    const authenticated = { ...headers, "X-CSRF-Token": session.csrfToken };
    assert.equal((await fetch(base + "/api/news", { method: "POST", headers: authenticated, body: JSON.stringify({ title: "Authenticated editor draft" }) })).status, 201);
    const original = process.env.EDITOR_PASSWORD_HASH; process.env.EDITOR_PASSWORD_HASH = await passwordHash("different-strong-password-987654");
    assert.equal((await fetch(base + "/api/admin/news", { headers })).status, 401);
    process.env.EDITOR_PASSWORD_HASH = original;
    assert.equal((await fetch(base + "/api/auth/logout", { method: "POST", headers: authenticated })).status, 200);
    assert.equal((await fetch(base + "/api/admin/news", { headers })).status, 401);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve())); await store.db.dropDatabase(); await store.close();
    for (const key of keys) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
  }
});
