import fs from "node:fs";
const html=fs.readFileSync("dist/client/index.html","utf8");
const js=html.match(/<script\b[^>]*\bsrc="(\/assets\/index-[^"]+\.js)"/i)?.[1];
const css=html.match(/<link\b[^>]*\bhref="(\/assets\/index-[^"]+\.css)"/i)?.[1];
if(!js || !css)throw Error("Vite entry assets missing from built HTML");
const contents="// Generated from tested dist/client/index.html; refresh when the frontend changes.\nexport const CLIENT_SCRIPT = "+JSON.stringify(js)+";\nexport const CLIENT_STYLESHEET = "+JSON.stringify(css)+";\n";
fs.writeFileSync("api/client-assets.js",contents);
console.log("Generated API article asset map");
