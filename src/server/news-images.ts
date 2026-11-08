import type { Article } from "../types";
import type { Publisher } from "./publishers";
import { plainText } from "../lib/seo";

type ImageFields = Pick<Article, "imageUrl" | "imageCredit" | "imageLicense" | "imageSource" | "imageCaption" | "imageType">;
export async function freeImage(article: Article, phrase: string): Promise<ImageFields | undefined> {
  const source = [article.title, article.aiSummary, plainText(article.fullContent)].join(" ").toLowerCase();
  const words = phrase.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [];
  const generic = new Set(["world", "news", "climate", "business", "science", "technology", "economy", "politics", "health", "photo", "image"]);
  if (phrase.length < 6 || !source.includes(phrase.toLowerCase()) || !words.some(word => !generic.has(word))) return undefined;
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({ action: "query", format: "json", generator: "search", gsrsearch: `filetype:bitmap ${phrase}`, gsrnamespace: "6", gsrlimit: "4", prop: "imageinfo", iiprop: "url|extmetadata|mediatype", iiurlwidth: "1200" }).toString();
  try {
    const response = await fetch(url, { headers: { "User-Agent": "AtlasTimes/1.0 (https://github.com/anantm9200/theatlastimes)" }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) return undefined;
    const raw = await response.text(); if (raw.length > 1000000) return undefined;
    const result = JSON.parse(raw);
    for (const page of Object.values(result.query?.pages || {}) as any[]) {
      const info = page.imageinfo?.[0], metadata = info?.extmetadata || {};
      const license = plainText(metadata.LicenseShortName?.value || "");
      if (!info || info.mediatype !== "BITMAP" || !/^(CC BY(?:-SA)?(?: \d(?:\.\d)?)?|CC0(?: \d(?:\.\d)?)?|Public domain)$/i.test(license)) continue;
      const description = plainText(`${page.title} ${metadata.ImageDescription?.value || ""}`).toLowerCase();
      if (words.filter(word => description.includes(word)).length < Math.min(2, words.length)) continue;
      const imageUrl = info.thumburl || info.url, credit = plainText(metadata.Attribution?.value || metadata.Artist?.value || "");
      if (!credit || new URL(imageUrl).hostname !== "upload.wikimedia.org" || !imageUrl.startsWith("https://")) continue;
      return { imageUrl, imageType: "free", imageCredit: credit.slice(0, 500), imageLicense: `${license}${metadata.LicenseUrl?.value ? ` — ${metadata.LicenseUrl.value}` : ""}`.slice(0, 1000), imageSource: info.descriptionurl, imageCaption: `File image: ${plainText(page.title.replace(/^File:/, ""))}. This is not a photograph of the reported event.`.slice(0, 1000) };
    }
  } catch {}
  return undefined;
}
export function publisherImage(article: Article, publisher: Publisher): ImageFields | undefined {
  if (!publisher.imagesEnabled || !publisher.imagePermission || !article.publisherImageUrl || !article.publisherImageCredit) return undefined;
  try { if (!publisher.imageHosts.includes(new URL(article.publisherImageUrl).hostname) || !article.publisherImageUrl.startsWith("https://")) return undefined; } catch { return undefined; }
  return { imageUrl: article.publisherImageUrl, imageType: "publisher", imageCredit: article.publisherImageCredit, imageLicense: "Publisher-authorized image", imageSource: publisher.name, imageCaption: article.title };
}
export async function selectNewsImage(article: Article, publisher: Publisher, search: string, lookup = freeImage): Promise<ImageFields> {
  // Free licensed material is considered first. Publisher URLs are never fetched,
  // resized, stripped, downloaded or proxied by this application.
  const headline = article.title.split(/[—–:|]/)[0]?.replace(/[^\p{L}\p{N} -]/gu, " ").replace(/\s+/g, " ").trim() || "";
  const words = headline.split(/\s+/).filter(Boolean);
  // Retry with terms grounded in the actual headline, never generic stock-image categories.
  // The image lookup itself checks the license, credit, description and file host.
  const phrases = [...new Set([search, words.slice(0, 4).join(" "), words.slice(0, 2).join(" ")].map(item => item?.trim()).filter(Boolean))].slice(0, 3);
  for (const phrase of phrases) {
    const licensed = await lookup(article, phrase);
    if (licensed) return licensed;
  }
  return publisherImage(article, publisher) || {};
}
