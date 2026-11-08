import test from "node:test";
import assert from "node:assert/strict";
import { gatherSourceWire } from "../api/source-wire.js";
const now = Date.parse("2026-11-08T17:00:00Z");

test("packaged official wire allows fresh headlines only from approved hosts",async()=>{
 const result=await gatherSourceWire(now,async url=>({items:[
  {title:"New official source report available",link:url.includes("nasa")?"https://www.nasa.gov/valid":
    url.includes("noaa")?"https://www.noaa.gov/valid":
    url.includes("sec.gov")?"https://www.sec.gov/valid":"https://globalvoices.org/valid",
   isoDate:new Date(now-3600_000).toISOString()},
  {title:"Untrusted external publisher report",link:"https://fake.invalid/story",isoDate:new Date(now-3600_000).toISOString()}
 ]}));
 assert.equal(result.data.length,4);
 assert.ok(result.data.every(item=>!item.url.includes("fake.invalid")));
});
