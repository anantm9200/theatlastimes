import { useEffect, useState } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import SeoHead, { browserSiteOrigin } from "../lib/SeoHead";
import { articlePath, collectionStructuredData } from "../lib/seo";
import { newsAge, newsImage, readNews } from "../lib/newsApi";
import NewsPhoto from "../components/NewsPhoto";
import { Article } from "../types";

export default function Feed() {
  const { id } = useParams();
  const location = useLocation();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isRegion = location.pathname.includes("/region/");
  const label = (id || "global").replace(/-/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
  const title = id === "global" || id === "feed" ? "Global News" : isRegion ? `${label} News` : label === "Ai" ? "AI News" : `${label} News`;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setArticles([]);
    const params = new URLSearchParams({ limit: "50" });
    if (id && id !== "global" && id !== "feed") params.set(isRegion ? "region" : "category", id.replace(/-/g, " "));
    readNews<Article[]>(`/api/news?${params}`, controller.signal)
      .then(data => {
        if (!controller.signal.aborted) { setArticles(data); setLoading(false); }
      })
      .catch(err => {
        if (!controller.signal.aborted) { setError(err.message); setLoading(false); }
      });
    return () => controller.abort();
  }, [id, isRegion]);

  const heroArticle = articles.length > 0 ? articles[0] : null;
  const gridArticles = articles.slice(1);

  const heroImage = heroArticle ? newsImage(heroArticle) : "";

  return (
    <div className="w-full bg-background mb-16">
      <SeoHead title={title} description={`Latest ${title.toLowerCase()} with linked reporting and source-attributed summaries from The Atlas Times.`} structuredData={collectionStructuredData(title, location.pathname, articles, browserSiteOrigin())} />
      <div className="py-12 text-center border-b border-border mb-12">
          <h1 className="text-5xl md:text-7xl font-old-english font-bold capitalize tracking-normal text-foreground">{title}</h1>
          <p className="mt-4 text-sm font-bold uppercase tracking-widest text-muted-foreground">Latest reports and analysis</p>
      </div>
      
      {loading ? <div role="status" className="py-20 text-center">Loading reports…</div> : error ? <div role="alert" className="py-20 text-center">{error}</div> : articles.length === 0 ? (
        <div className="text-muted-foreground font-serif text-center py-10 text-xl">No active reports in this sector.</div>
      ) : (
        <div className="flex flex-col gap-12">
            
            {/* Top Category Story */}
            {heroArticle && (
                <div className="group grid grid-cols-1 md:grid-cols-2 gap-8 items-center border-b border-border pb-12">
                    <NewsPhoto article={heroArticle} priority />
                    <div className="flex flex-col justify-center">
                        <span className="text-[10px] text-primary uppercase font-bold tracking-wider mb-4 border border-primary px-2 py-1 w-fit">{heroArticle.region}</span>
                        <h2 className="font-serif font-black text-4xl mb-6 leading-tight group-hover:text-primary transition-colors"><Link to={articlePath(heroArticle)}>{heroArticle.title}</Link></h2>
                        <p className="text-lg font-serif text-muted-foreground leading-relaxed mb-6 border-l-4 border-primary pl-4">{heroArticle.aiSummary}</p>
                        <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            <span>{heroArticle.sourceName}</span>
                            <span>&bull;</span>
                            <span>{newsAge(heroArticle.publishedAt)}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Denser Lower Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
               {gridArticles.map((article) => (
                   <Link to={articlePath(article)} key={article.id} className="group flex flex-col">
                       <span className="text-[10px] text-primary uppercase tracking-widest font-bold mb-2">{isRegion ? article.category : article.region}</span>
                       <h3 className="font-serif font-bold text-lg leading-tight mb-2 group-hover:text-primary transition-colors">{article.title}</h3>
                       <p className="text-xs text-muted-foreground line-clamp-3 mb-4">{article.aiSummary}</p>
                       <span className="text-[10px] mt-auto font-bold text-muted-foreground uppercase">{newsAge(article.publishedAt)}</span>
                   </Link>
               ))}
            </div>
            
        </div>
      )}
    </div>
  )
}
