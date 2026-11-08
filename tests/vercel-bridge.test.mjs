import test from "node:test";
import assert from "node:assert/strict";
import { CLIENT_SCRIPT, CLIENT_STYLESHEET } from "../api/client-assets.js";
import { replaceArticleAssets } from "../api/index.js";

test("server-rendered article uses exact hashed frontend assets", () => {
 const old = '<!doctype html><script type="module" crossorigin src="/assets/index-OLD.js"></script><link rel="stylesheet" crossorigin href="/assets/index-OLD.css"><article><h1>A sourced report</h1></article>';
 const fresh=replaceArticleAssets(old);
 assert.match(fresh, /<h1>A sourced report/);
 assert.ok(fresh.includes(CLIENT_SCRIPT));
 assert.ok(fresh.includes(CLIENT_STYLESHEET));
 assert.equal(fresh.includes("index-OLD"),false);
});
test("upstream article content cannot replace static asset path",()=>{
 assert.equal(CLIENT_SCRIPT.startsWith("/assets/index-"),true);
 assert.equal(CLIENT_STYLESHEET.startsWith("/assets/index-"),true);
});
