import { isIP } from "node:net";
import { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";

export function rateLimitClientKey(request: Pick<Request, "headers" | "ip" | "socket">, vercel: boolean) {
  // Vercel overwrites x-real-ip at its edge. Only trust it in that runtime:
  // https://vercel.com/docs/headers/request-headers#x-real-ip
  const supplied = vercel ? request.headers["x-real-ip"] : undefined;
  const ip = typeof supplied === "string" && isIP(supplied)
    ? supplied : request.ip || request.socket.remoteAddress || "unknown";
  return ipKeyGenerator(ip);
}
