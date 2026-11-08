import { useEffect, useState } from "react";
import type { Article } from "../types";
import { newsImage } from "../lib/newsApi";

/** Display only documented photos. When missing, use a clearly labeled editorial graphic. */
export default function NewsPhoto({ article, priority = false, compact = false }: { article: Article; priority?: boolean; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [article.imageUrl]);
  const src = newsImage(article);
  const hasPhoto = !failed && src !== "/news-placeholder.svg";
  const aspect = compact ? "aspect-[16/10]" : "aspect-[16/9]";
  if (!hasPhoto) return <figure className="w-full my-0">
    <div role="img" aria-label={`Editorial illustration for ${article.category}; no verified event photograph available`}
      className={`relative ${aspect} overflow-hidden border border-border bg-[#102536] text-white flex flex-col justify-between p-5 sm:p-8`}>
      <div className="absolute inset-0 opacity-30 pointer-events-none" aria-hidden="true"
        style={{ backgroundImage: "radial-gradient(circle at 75% 15%, #9eb4c6 0, transparent 38%), repeating-linear-gradient(135deg, transparent 0px, transparent 31px, #ffffff12 32px)" }} />
      <div className="relative flex justify-between items-start gap-4">
        <span className="text-[11px] tracking-[.22em] uppercase font-bold">The Atlas Times</span>
        <span className="text-[11px] tracking-widest uppercase border border-white/50 px-2 py-1">{article.category}</span>
      </div>
      <div className="relative max-w-[92%]">
        <p className="font-serif text-2xl sm:text-3xl lg:text-4xl leading-tight line-clamp-3">{article.title}</p>
        <p className="mt-4 text-[11px] uppercase tracking-widest text-white/70">Editorial graphic · Not event photography</p>
      </div>
    </div>
  </figure>;
  return <figure className="w-full my-0">
    <img src={src} alt={article.imageCaption || `Illustration accompanying ${article.title}`}
      width="1200" height="675" loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"} decoding="async" referrerPolicy="no-referrer"
      onError={() => setFailed(true)} className={`w-full ${aspect} object-cover border border-border`} />
    <figcaption className="text-xs text-muted-foreground mt-2 leading-relaxed">
      {article.imageType === "publisher" ? <>Publisher-authorized image · <a href={article.originalUrl} target="_blank" rel="noopener noreferrer" className="underline">{article.sourceName}</a></> : article.imageCredit}
      {article.imageLicense && <> · {article.imageLicense}</>}
      {article.imageCaption && <> · {article.imageCaption}</>}
      {article.imageSource?.startsWith("https://") && <> · <a href={article.imageSource} className="underline" target="_blank" rel="noopener noreferrer">Image source</a></>}
    </figcaption>
  </figure>;
}
