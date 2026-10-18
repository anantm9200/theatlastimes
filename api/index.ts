import type { IncomingMessage, ServerResponse } from "node:http";
import { createProductionApp } from "../server";

let application: ReturnType<typeof createProductionApp> | undefined;
// Reuse the Mongo connection pool per warm Vercel instance; never start a poller.
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    application ||= createProductionApp().catch(error => { application = undefined; throw error; });
    const { app } = await application;
    app(req, res);
  } catch {
    res.statusCode = 503;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "News storage is unavailable. Check the deployment configuration." }));
  }
}
