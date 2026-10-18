import { proxyToDgx } from "./dgx-proxy.js";

// Vercel is a delivery gateway. News storage, HTML rendering and all background
// work run on the DGX; this function has no database or model fallback.
export default async function handler(req, res) {
  try {
    if (!process.env.DGX_ORIGIN) throw new Error("DGX origin is not configured");
    await proxyToDgx(req, res);
  } catch {
    res.statusCode = 503;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "The news service is temporarily unavailable." }));
  }
}
