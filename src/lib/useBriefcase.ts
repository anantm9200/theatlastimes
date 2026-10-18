import { useSyncExternalStore } from "react";

const key = "briefcase";
const event = "atlas-briefcase-change";
let cached: string[] = [];
let lastRaw: string | null | undefined;
let memoryOnly = false;

function snapshot(): string[] {
  if (typeof window === "undefined" || memoryOnly) return cached;
  try {
    const raw = localStorage.getItem(key);
    if (raw !== lastRaw) {
      lastRaw = raw;
      const value = JSON.parse(raw || "[]");
      cached = Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length < 200))].slice(0, 1000) : [];
    }
  } catch { memoryOnly = true; }
  return cached;
}
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(event, listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener(event, listener); };
}
function update(ids: string[]) {
  cached = ids;
  try { lastRaw = JSON.stringify(ids); localStorage.setItem(key, lastRaw); }
  catch { memoryOnly = true; }
  window.dispatchEvent(new Event(event));
}
const serverSnapshot: string[] = [];

export function useBriefcase() {
  const savedIds = useSyncExternalStore(subscribe, snapshot, () => serverSnapshot);
  const saveArticle = (id: string) => { const current = snapshot(); if (!current.includes(id)) update([...current, id]); };
  const removeArticle = (id: string) => update(snapshot().filter(value => value !== id));
  return { savedIds, saveArticle, removeArticle, isSaved: (id: string) => savedIds.includes(id) };
}
