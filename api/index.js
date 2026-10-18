import { proxyToDgx } from "./dgx-proxy.js";

// Vercel is a delivery gateway. News storage, HTML rendering and all background
// work run on the DGX; this function has no database or model fallback.
export default async function handler(req, res) {
  try {
    if (!process.env.DGX_ORIGIN) throw new Error("DGX origin is not configured");
    await proxyToDgx(req, res);
  } catch (error) {
    const code = error?.cause?.code || error?.code || error?.name;
    const known = ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "ERR_TLS_CERT_ALTNAME_INVALID", "TimeoutError", "AbortError", "TypeError", "Error"];
    // Log only a bounded category and configuration presence, never upstream
    // URLs, request headers, credentials or arbitrary exception messages.
    console.error("DGX gateway unavailable", { reason: known.includes(code) ? code : "UPSTREAM_ERROR", configured: Boolean(process.env.DGX_ORIGIN && (process.env.DGX_GATEWAY_KEY || "").length >= 32) });
    res.statusCode = 503;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "The news service is temporarily unavailable." }));
  }
}
