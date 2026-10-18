import { isIP } from "node:net";

export async function proxyToDgx(req, res) {
  const origin = new URL(process.env.DGX_ORIGIN);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash || (process.env.DGX_GATEWAY_KEY || "").length < 32) throw new Error("Invalid DGX gateway configuration");
  const path = new URL(req.url || "/", "https://request.invalid");
  const target = new URL(origin); target.pathname = path.pathname; target.search = path.search;
  const headers = new Headers({ "X-Atlas-Gateway-Key": process.env.DGX_GATEWAY_KEY });
  for (const name of ["authorization", "cookie", "content-type", "x-csrf-token", "origin", "accept"]) {
    if (typeof req.headers[name] === "string") headers.set(name, req.headers[name]);
  }
  const ip = req.headers["x-real-ip"];
  if (typeof ip === "string" && isIP(ip)) headers.set("X-Atlas-Client-IP", ip);
  const hasBody = !["GET", "HEAD"].includes(req.method || "GET");
  // Vercel's Node helper may have consumed the incoming stream into req.body.
  const body = !hasBody ? undefined : req.body === undefined ? req
    : typeof req.body === "string" || Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body);
  const response = await fetch(target, { method: req.method, headers, body, ...(hasBody ? { duplex: "half" } : {}), redirect: "manual", signal: AbortSignal.timeout(50000) });
  res.statusCode = response.status;
  for (const name of ["content-type", "cache-control", "x-robots-tag", "location", "retry-after", "ratelimit", "ratelimit-policy", "x-content-type-options", "referrer-policy", "x-frame-options"]) {
    const value = response.headers.get(name); if (value) res.setHeader(name, value);
  }
  const cookies = response.headers.getSetCookie(); if (cookies.length) res.setHeader("Set-Cookie", cookies);
  res.end(Buffer.from(await response.arrayBuffer()));
}
