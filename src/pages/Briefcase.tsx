import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Article } from "../types";
import { useBriefcase } from "../lib/useBriefcase";
import SeoHead from "../lib/SeoHead";
import { articlePath } from "../lib/seo";
import { newsDate, readNews } from "../lib/newsApi";

export default function Briefcase() {
  const { savedIds, removeArticle } = useBriefcase();
  const [savedArticles, setSavedArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [unavailable, setUnavailable] = useState(0);
  const pages = Math.max(1, Math.ceil(savedIds.length / 20));
  const currentPage = Math.min(page, pages);

  useEffect(() => {
    const controller = new AbortController();
    if (savedIds.length === 0) { setSavedArticles([]); setUnavailable(0); setLoading(false); return; }
    setLoading(true);
    Promise.allSettled(savedIds.slice((currentPage - 1) * 20, currentPage * 20).map(id => readNews<Article>(`/api/news/${encodeURIComponent(id)}`, controller.signal)))
      .then(results => {
        if (controller.signal.aborted) return;
        setSavedArticles(results.flatMap(result => result.status === "fulfilled" ? [result.value] : []));
        setUnavailable(results.filter(result => result.status === "rejected").length);
        setLoading(false);
      });
    return () => controller.abort();
  }, [savedIds, currentPage]);

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-0 py-12">
      <SeoHead title="Your briefcase" noindex />
      <h1 className="text-4xl lg:text-5xl font-old-english font-black text-foreground mb-4">The Briefcase</h1>
      <p className="text-muted-foreground mb-12 uppercase tracking-widest text-xs font-bold">Your Saved Intelligence Reports</p>

      {loading ? (
        <div className="text-center py-20 text-muted-foreground">Opening Briefcase...</div>
      ) : savedArticles.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground border border-dashed border-border">
            <h2 className="text-2xl font-serif mb-4">{savedIds.length ? "Saved reports are unavailable" : "Your Briefcase is Empty"}</h2>
            <p className="mb-6">{savedIds.length ? "These reports may have been removed or the news service may be unavailable. Try again later." : "Save articles to read them later. Your saved list stays in this browser."}</p>
            <Link to="/" className="text-primary font-bold underline underline-offset-4">Browse Reports</Link>
        </div>
      ) : (
        <div className="space-y-6">
          {savedArticles.map((article) => (
             <div key={article.id} className="group flex flex-col md:flex-row gap-6 border border-border p-6 hover:bg-muted/30 transition-colors relative">
                <button 
                  aria-label={`Remove ${article.title} from briefcase`}
                  onClick={() => removeArticle(article.id)}
                  className="absolute top-4 right-4 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-destructive z-10"
                >
                  Remove
                </button>
                <Link to={articlePath(article)} className="flex-1 flex flex-col justify-center">
                  <div className="flex items-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
                     <span className="text-primary">{article.category}</span>
                     <span className="mx-2">•</span>
                     <span>{newsDate(article.publishedAt)}</span>
                  </div>
                  <h2 className="font-serif text-xl lg:text-2xl font-bold mb-2 group-hover:underline decoration-primary underline-offset-4">
                    {article.title}
                  </h2>
                  <p className="text-sm text-foreground/80 line-clamp-2 leading-relaxed">
                    {article.aiSummary}
                  </p>
                </Link>
             </div>
          ))}
        </div>
      )}
      {unavailable > 0 && savedArticles.length > 0 && <p role="status" className="mt-5 text-sm text-muted-foreground">{unavailable} saved reports on this page are currently unavailable.</p>}
      {pages > 1 && <div className="flex gap-5 items-center mt-8"><button disabled={currentPage === 1 || loading} onClick={() => setPage(currentPage - 1)} className="border px-4 py-2 disabled:opacity-40">Previous</button><span>Page {currentPage} of {pages}</span><button disabled={currentPage === pages || loading} onClick={() => setPage(currentPage + 1)} className="border px-4 py-2 disabled:opacity-40">Next</button></div>}
    </div>
  );
}
