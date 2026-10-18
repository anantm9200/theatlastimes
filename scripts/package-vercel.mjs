import fs from "node:fs/promises";
import path from "node:path";

const output = ".vercel/output", handler = path.join(output, "functions/api/index.func");
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(handler, { recursive: true });
await fs.cp("dist/client", path.join(output, "static"), { recursive: true });
for (const filename of ["index.js", "dgx-proxy.js"]) await fs.copyFile(`api/${filename}`, path.join(handler, filename));
await fs.writeFile(path.join(handler, "package.json"), JSON.stringify({ type: "module" }));
await fs.writeFile(path.join(handler, ".vc-config.json"), JSON.stringify({ runtime: "nodejs22.x", handler: "index.js", maxDuration: 60, shouldAddHelpers: true }));
const configuration = JSON.parse(await fs.readFile("vercel.json", "utf8"));
await fs.writeFile(path.join(output, "config.json"), JSON.stringify({ version: 3, routes: configuration.routes }, null, 2));
console.log("Packaged DGX-built assets and the Vercel delivery gateway");
