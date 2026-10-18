import { useEffect, useState } from "react";
import type { Article } from "../types";
import { newsImage } from "../lib/newsApi";

export default function NewsPhoto({ article, priority = false }: { article: Article; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [article.imageUrl]);
  const src = failed ? "/news-placeholder.svg" : newsImage(article), placeholder = src === "/news-placeholder.svg";
  const image = <img src={src} alt={placeholder ? "No relevant licensed photo available" : article.imageCaption || article.title} width="1200" height="675" loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="w-full h-auto max-h-[650px] object-contain border border-border" />;
  return <figure className="w-full my-5">
    {article.imageType === "publisher" && !placeholder ? <a href={article.originalUrl} target="_blank" rel="noopener noreferrer">{image}</a> : image}
    {!placeholder && <figcaption className="mt-2 text-xs text-muted-foreground">
      {article.imageType === "publisher" && <><a href={article.originalUrl} className="underline" target="_blank" rel="noopener noreferrer">Courtesy: {article.sourceName}</a> · </>}
      {article.imageCredit} {article.imageLicense && <> · {article.imageLicense}</>}
      {article.imageType === "free" && article.imageSource?.startsWith("https://") && <> · <a href={article.imageSource} className="underline" target="_blank" rel="noopener noreferrer">Image source</a></>}
      {article.imageCaption && <span className="block mt-1">{article.imageCaption}</span>}
    </figcaption>}
  </figure>;
}
