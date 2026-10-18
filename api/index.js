// Load the built ESM bundle with its explicit extension. Vercel's TS compiler
// preserves extensionless imports, which Node cannot resolve in type=module.
import { createProductionApp } from "../dist/server.mjs";

let application;
// Reuse the Mongo connection pool per warm Vercel instance; never start a poller.
export default async function handler(req, res) {
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
