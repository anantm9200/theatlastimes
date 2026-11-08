import test from "node:test";
import assert from "node:assert/strict";
import { gatherSourceWire } from "../src/server/source-wire";

const clock=Date.parse("2026-11-08T12:00:00Z");
test("wire only emits recent attributable headlines from allowlisted official publisher hosts",async()=>{
  const calls:string[]=[];
  const wire=await gatherSourceWire(clock,async feed=>{
    calls.push(feed);
    const hostname = new URL(feed).hostname;
    const articleHost=hostname==="www.noaa.gov"?"www.noaa.gov":
      hostname==="www.sec.gov"?"www.sec.gov":
      hostname==="www.nasa.gov"?"www.nasa.gov":"globalvoices.org";
    return {items:[
      {title:"Official public source report released today",link:`https://${articleHost}/news/current`,isoDate:new Date(clock-3_600_000).toISOString()},
      {title:"Forbidden external report link",link:"https://malicious.example/fake",isoDate:new Date(clock-3_600_000).toISOString()},
      {title:"Old event that should never be current",link:`https://${articleHost}/archive`,isoDate:"2026-10-01T10:00:00Z"},
    ]};
  });
  assert.equal(wire.data.length,4);
  assert.equal(wire.data.every(item=>item.url.startsWith("https://")),true);
  assert.equal(wire.data.some(item=>item.url.includes("malicious.example")),false);
  assert.equal(wire.data.every(item=>item.publishedAt==="2026-11-08T11:00:00.000Z"),true);
  assert.equal(calls.some(url=>url.includes("bbci.co.uk")),false);
  assert.match(wire.note,/Not Atlas Times articles/);
});
test("one failed publisher does not hide other source headlines",async()=>{
  const wire=await gatherSourceWire(clock,async feed=>{
    if(feed.includes("globalvoices"))throw new Error("source unavailable");
    return {items:[{title:"New official update on research",link:
      feed.includes("nasa")?"https://www.nasa.gov/new":feed.includes("sec")?"https://www.sec.gov/new":"https://www.noaa.gov/new",
      isoDate:new Date(clock-3600_000).toISOString()}]};
  });
  assert.equal(wire.data.length,3);
});
