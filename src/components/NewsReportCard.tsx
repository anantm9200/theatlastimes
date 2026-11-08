import { Link } from "react-router-dom";
import type { Article } from "../types";
import { articlePath } from "../lib/seo";
import { newsAge } from "../lib/newsApi";
import NewsPhoto from "./NewsPhoto";

export default function NewsReportCard({ article, image = false, compact = false }: { article: Article; image?: boolean; compact?: boolean }) {
  return <article className="flex flex-col min-w-0 h-full border-t border-border pt-4 group">
    {image && <div className="mb-4"><NewsPhoto article={article} compact /></div>}
    <Link to={articlePath(article)} className="block">
      <p className="text-[11px] font-bold tracking-widest uppercase text-primary mb-2">{article.category}</p>
      <h3 className={`font-serif font-bold leading-snug group-hover:text-primary ${compact ? "text-lg" : "text-xl lg:text-2xl"}`}>{article.title}</h3>
      <p className="mt-3 font-serif text-sm leading-relaxed text-muted-foreground line-clamp-3">{article.aiSummary || article.snippet || "Read the source-attributed report."}</p>
    </Link>
    <p className="text-xs text-muted-foreground mt-auto pt-4">{article.sourceName} · {newsAge(article.publishedAt)}</p>
  </article>;
}
