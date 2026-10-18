import test from "node:test";
import assert from "node:assert/strict";
import type { Request } from "express";
import { rateLimitClientKey } from "../src/server/client-ip.ts";

test("rate limits trust the platform client IP only on Vercel and group IPv6 subnets", () => {
  const request = (headers: Record<string, string>, ip = "192.0.2.1") => ({ headers, ip, socket: { remoteAddress: "127.0.0.1" } }) as Request;
  const forwarded = request({ "x-real-ip": "198.51.100.2", "forwarded": "for=203.0.113.9", "x-forwarded-for": "203.0.113.10" });
  assert.equal(rateLimitClientKey(forwarded, true), "198.51.100.2");
  assert.equal(rateLimitClientKey(forwarded, false), "192.0.2.1");
  assert.equal(rateLimitClientKey(request({ "x-real-ip": "invalid" }), true), "192.0.2.1");
  assert.equal(rateLimitClientKey(request({ "x-real-ip": "2001:db8:abcd:1200::1" }), true), rateLimitClientKey(request({ "x-real-ip": "2001:db8:abcd:12ff::2" }), true));
});
