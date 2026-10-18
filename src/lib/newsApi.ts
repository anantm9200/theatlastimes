import type { Article } from "../types";
import { format, formatDistanceToNow } from "date-fns";

export async function readNews<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(response.status === 404 ? "Report not found." : "News is temporarily unavailable. Please try again.");
  const body = await response.json();
  if (!body || !("data" in body)) throw new Error("The news service returned an invalid response.");
  return body.data as T;
}

export function newsDate(value: string, pattern = "MMM d, yyyy"): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : format(date, pattern);
}

export function newsAge(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : formatDistanceToNow(date, { addSuffix: true });
}

export function newsImage(article: Article): string {
  const image = article.imageUrl;
  // Placeholder and generated decoration must not appear to be news photography.
  if (image && !image.includes("picsum.photos") && !image.includes("/api/assets/visual") && (/^https?:\/\//i.test(image) || /^\/(?!\/)/.test(image))) return image;
  return "/news-placeholder.svg";
}
