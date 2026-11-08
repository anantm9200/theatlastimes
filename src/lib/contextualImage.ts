import type { Article } from "../types";

export interface ContextImage {
  url: string; credit: string; license: string; source: string; caption: string;
}
const cache = new Map<string, Promise<ContextImage | undefined>>();
const blocked = new Set(["the","and","news","latest","shows","about","with","from","into","over","under","more","after","before","that","this","global","world","report","study","says","promise","new","today","mission","ends","leaves","behind"]);
const licenseAllowed = /^(?:CC BY(?:-SA)?(?: \d(?:\.\d)?)?|CC0(?: \d(?:\.\d)?)?|Public domain)$/i;
const asText = (value: unknown): string => String(value || "").replace(/<[^>]*>/g," ").replace(/&(?:amp|nbsp|quot);/g," ").replace(/\s+/g," ").trim();

async function find(article: Article, fetcher: typeof fetch): Promise<ContextImage | undefined> {
  // Search only grounded subject words; never pick a generic cityscape as event photography.
  const terms=[...new Set((article.title.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu)||[]).filter(w=>!blocked.has(w)))].slice(0,4);
  if(terms.length<2)return undefined;
  const url=new URL("https://commons.wikimedia.org/w/api.php");
  url.search=new URLSearchParams({
    action:"query",format:"json",origin:"*",generator:"search",
    gsrsearch:`filetype:bitmap ${terms.slice(0,3).join(" ")}`,gsrnamespace:"6",gsrlimit:"5",
    prop:"imageinfo",iiprop:"url|extmetadata|mediatype",iiurlwidth:"900",
  }).toString();
  try {
    const response=await fetcher(url.toString(),{signal:AbortSignal.timeout(8500)});
    if(!response.ok)return undefined;
    const data=await response.json();
    for(const page of Object.values(data?.query?.pages||{}) as any[]){
      const info=page?.imageinfo?.[0],meta=info?.extmetadata||{};
      if(info?.mediatype!=="BITMAP")continue;
      const license=asText(meta.LicenseShortName?.value);
      if(!licenseAllowed.test(license))continue;
      const description=asText(`${page.title||""} ${meta.ImageDescription?.value||""}`).toLowerCase();
      if(terms.filter(term=>description.includes(term)).length<2)continue;
      const credit=asText(meta.Attribution?.value||meta.Artist?.value||meta.Credit?.value);
      if(!credit)continue;
      const img=info.thumburl||info.url,source=info.descriptionurl;
      if(typeof img!=="string"||typeof source!=="string")continue;
      const imageUrl=new URL(img),sourceUrl=new URL(source);
      if(imageUrl.protocol!=="https:"||imageUrl.hostname!=="upload.wikimedia.org" ||
        sourceUrl.protocol!=="https:"||sourceUrl.hostname!=="commons.wikimedia.org")continue;
      return {url:img,credit:credit.slice(0,250),license,source,
        caption:"Licensed contextual file image from Wikimedia Commons. Not a photograph of the reported event."};
    }
  }catch{ /* External image lookup is optional; fall back to an editorial graphic. */ }
  return undefined;
}
export function contextualImage(article: Article, fetcher: typeof fetch = fetch): Promise<ContextImage | undefined> {
  if(!cache.has(article.id))cache.set(article.id,find(article,fetcher));
  return cache.get(article.id)!;
}
