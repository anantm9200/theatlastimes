import { isIP } from "node:net";
import { proxyToDgx } from "./dgx-proxy.js";
import { CLIENT_SCRIPT, CLIENT_STYLESHEET } from "./client-assets.js";

// A pinned, separate Vercel alias for the previously deployed DGX-authenticated
// gateway. It is NOT a Tailscale IP or a secret and must never point at this
// deployment; see docs/NEWSROOM_VERCEL_BRIDGE.md.
const LEGACY_ORIGIN = new URL("https://atlas-times-origin-anant-icl.vercel.app");
const SAFE_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);
const PASSTHROUGH = ["content-type", "cache-control", "etag", "last-modified", "x-robots-tag", "location", "retry-after", "ratelimit", "ratelimit-policy", "x-content-type-options", "referrer-policy", "x-frame-options"];
const REQUEST_HEADERS = ["accept", "authorization", "cookie", "content-type", "x-csrf-token", "origin", "if-none-match", "if-modified-since", "accept-language"];
const SSR_PATH = /^\/article\/[^/]+$/;
const API_PATH = /^\/api\/[A-Za-z0-9/_-]+$/;
const DISCOVERY = /^\/(?:robots\.txt|sitemap\.xml|news-sitemap\.xml|rss\.xml|feed\.xml)$/;

export function replaceArticleAssets(html) {
  if (!CLIENT_SCRIPT.startsWith("/assets/") || !CLIENT_STYLESHEET.startsWith("/assets/")) {
    throw new Error("Missing deployment asset manifest");
  }
  const withScript = html.replace(/(<script\b[^>]*\bsrc=")\/assets\/index-[^"]+\.js(")/i, (_, start, end) => start + CLIENT_SCRIPT + end);
  return withScript.replace(/(<link\b[^>]*\bhref=")\/assets\/index-[^"]+\.css(")/i, (_, start, end) => start + CLIENT_STYLESHEET + end);
}

export default async function handler(req, res) {
  // Prefer direct authenticated DGX when the deployment actually has its
  // production secrets. A misconfigured direct connection is never silently
  // bypassed through the legacy relay.
  if (process.env.DGX_ORIGIN) {
    try {
      await proxyToDgx(req, res);
    } catch (error) {
      const code = error?.cause?.code || error?.code || error?.name;
      const known = ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "ERR_TLS_CERT_ALTNAME_INVALID", "TimeoutError", "AbortError", "TypeError", "Error"];
      console.error("DGX gateway unavailable", {
        reason: known.includes(code) ? code : "UPSTREAM_ERROR",
        configured: Boolean(process.env.DGX_ORIGIN && (process.env.DGX_GATEWAY_KEY || "").length >= 32),
      });
      res.statusCode = 503;
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "The news service is temporarily unavailable." }));
    }
    return;
  }
  const method = req.method || "GET";
  const requestURL = new URL(req.url || "/", "https://reader.invalid");
  const pathname = requestURL.pathname;
  if (!SAFE_METHODS.has(method) || !(API_PATH.test(pathname) || SSR_PATH.test(pathname) || DISCOVERY.test(pathname))) {
    res.statusCode = 404;
    res.setHeader("Cache-Control", "no-store");
    res.end("Not found");
    return;
  }

  if (pathname === "/api/source-wire") {
    if (method !== "GET" && method !== "HEAD") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET, HEAD");
      res.end();
      return;
    }
    try {
      const { sourceWire } = await import("./source-wire.js");
      const body = JSON.stringify(await sourceWire());
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=300");
      res.end(method === "HEAD" ? undefined : body);
    } catch {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ error: "The source wire is temporarily unavailable." }));
    }
    return;
  }

  try {
    // A fixed allowlisted destination prevents SSRF and bypasses no editorial
    // or login controls. The original deployed Vercel gateway authenticates
    // requests to the private DGX server.
    const upstreamURL = new URL(pathname + requestURL.search, LEGACY_ORIGIN);
    if (upstreamURL.origin !== LEGACY_ORIGIN.origin) throw new Error("Unsafe upstream");

    const headers = new Headers();
    for (const name of REQUEST_HEADERS) {
      const value = req.headers?.[name];
      if (typeof value === "string") headers.set(name, value);
    }
    if (typeof req.headers?.["x-real-ip"] === "string" && isIP(req.headers["x-real-ip"])) {
      headers.set("x-real-ip", req.headers["x-real-ip"]);
    }
    const hasBody = method !== "GET" && method !== "HEAD";
    const body = !hasBody ? undefined :
      req.body === undefined ? req :
      typeof req.body === "string" || Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body);
    const upstream = await fetch(upstreamURL, {
      method,
      headers,
      body,
      ...(hasBody ? { duplex: "half" } : {}),
      redirect: "manual",
      signal: AbortSignal.timeout(45000),
    });

    res.statusCode = upstream.status;
    for (const name of PASSTHROUGH) {
      let value = upstream.headers.get(name);
      if (name === "location" && value) {
        try {
          const next = new URL(value, LEGACY_ORIGIN);
          if (next.origin === LEGACY_ORIGIN.origin) value = next.pathname + next.search + next.hash;
        } catch { /* Keep the original relative Location. */ }
      }
      if (value) res.setHeader(name, value);
    }
    const cookies = upstream.headers.getSetCookie();
    if (cookies.length) res.setHeader("Set-Cookie", cookies);
    if (method === "HEAD") { res.end(); return; }

    const data = Buffer.from(await upstream.arrayBuffer());
    const contentType = upstream.headers.get("content-type") || "";
    if (SSR_PATH.test(pathname) && upstream.ok && contentType.includes("text/html")) {
      res.end(replaceArticleAssets(data.toString("utf8")));
    } else {
      res.end(data);
    }
  } catch (error) {
    // Do not log private cookies, credentials, upstream response bodies or URLs.
    const name = error?.name === "TimeoutError" ? "timeout" : "unavailable";
    console.error("Atlas legacy gateway bridge", name);
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ error: "The news service is temporarily unavailable." }));
  }
}
