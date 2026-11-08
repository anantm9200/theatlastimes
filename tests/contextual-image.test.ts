import test from "node:test";
import assert from "node:assert/strict";
import { contextualImage } from "../src/lib/contextualImage";
import type { Article } from "../src/types";

const article=(id:string)=>({id,title:"NASA navigation experiment shows landing progress"} as Article);
const fake=(license:string,description="NASA navigation experiment")=> (async (_url:string)=>({
  ok:true,
  json:async()=>({query:{pages:{42:{title:"File:NASA navigation experiment.jpg",imageinfo:[{
    mediatype:"BITMAP",thumburl:"https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/photo.jpg",
    descriptionurl:"https://commons.wikimedia.org/wiki/File:NASA_navigation_experiment.jpg",
    extmetadata:{LicenseShortName:{value:license},Artist:{value:"NASA photographer"},ImageDescription:{value:description}},
  }]}}}}),
})) as unknown as typeof fetch;

test("old stories can display an attributed CC BY contextual image",async()=>{
  const photo=await contextualImage(article("context-a"),fake("CC BY 4.0"));
  assert.ok(photo);
  assert.equal(photo?.license,"CC BY 4.0");
  assert.match(photo!.caption,/Not a photograph of the reported event/);
});
test("never displays copyrighted or semantically unrelated images",async()=>{
  assert.equal(await contextualImage(article("context-b"),fake("All rights reserved")),undefined);
  assert.equal(await contextualImage(article("context-c"),fake("CC BY 4.0","A photo of unrelated farmland")),undefined);
});
