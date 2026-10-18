import { build } from "esbuild";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
// Bundle dependencies that cross the CommonJS/ESM boundary. Vercel's runtime
// loader does not support CommonJS require(ESM), even when local Node does.
const external = Object.keys(manifest.dependencies).filter(name => !["sanitize-html", "entities", "firebase-admin"].includes(name));
for (const [entry, output] of [["server.ts", "server"], ["scripts/dgx-worker.ts", "dgx-worker"]]) {
  await build({
    entryPoints: [entry], outfile: `dist/${output}.mjs`, bundle: true,
    platform: "node", target: "node22", format: "esm", external,
    banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
    logLevel: "info",
  });
}
