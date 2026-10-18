import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Article } from "../types";
import SeoHead, { browserSiteOrigin } from "../lib/SeoHead";
import NewsPhoto from "../components/NewsPhoto";
import { articlePath, collectionStructuredData, DEFAULT_DESCRIPTION } from "../lib/seo";
import { newsAge, newsDate, newsImage, readNews } from "../lib/newsApi";

const sections = [
  { title: "World & Politics", path: "/category/world", categories: ["World", "Geopolitics", "Global", "Politics"] },
  { title: "Technology & AI", path: "/category/technology", categories: ["Technology", "AI", "Tech Policy", "Security"] },
  { title: "Economy & Business", path: "/category/business", categories: ["Economy", "Business", "Trade", "Finance", "Markets"] },
  { title: "Climate & Science", path: "/category/climate", categories: ["Climate", "Environment", "Science"] },
];

function ReportCard({ article }: { article: Article }) {
  return <article className="flex flex-col border-t border-border pt-5">
    <Link to={articlePath(article)} className="group">
      <p className="text-[10px] text-primary uppercase tracking-widest font-bold mb-2">{article.category}</p>
      <h3 className="font-serif font-bold text-xl leading-snug mb-3 group-hover:text-primary">{article.title}</h3>
      <p className="text-sm font-serif text-muted-foreground line-clamp-3 leading-relaxed mb-4">{article.aiSummary || article.snippet}</p>
    </Link>
    <p className="text-[10px] mt-auto text-muted-foreground uppercase tracking-wide">{article.sourceName} · <time dateTime={article.publishedAt}>{newsAge(article.publishedAt)}</time></p>
  </article>;
}

export default function Home() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    readNews<Article[]>("/api/news?limit=75", controller.signal)
      .then(news => {
        if (!controller.signal.aborted) { setArticles(news); setLoading(false); }
      })
      .catch(err => {
        if (!controller.signal.aborted) { setError(err.message); setLoading(false); }
      });
    return () => controller.abort();
  }, []);

  const hero = articles[0];
  const latest = articles.slice(1, 5);
  const remaining = articles.slice(5);
  const grouped = sections.map(section => ({ ...section, reports: remaining.filter(article => section.categories.includes(article.category)).slice(0, 4) }));
  const used = new Set(grouped.flatMap(section => section.reports.map(article => article.id)));
  const wire = remaining.filter(article => !used.has(article.id));

  return <div className="bg-background text-foreground">
    <SeoHead description={DEFAULT_DESCRIPTION} path="/" structuredData={collectionStructuredData("Global news and analysis", "/", articles, browserSiteOrigin())} />
    <h1 className="sr-only">Global news and analysis</h1>
    {loading ? <p role="status" className="py-20 text-center font-serif text-xl animate-pulse">Loading news…</p> : error ? <p role="alert" className="py-20 text-center">{error}</p> : !hero ? <section className="py-20 text-center"><h2 className="text-3xl font-serif mb-4">Reports are on their way</h2><p>No reports have been published yet.</p></section> : <>
      <div className={`grid grid-cols-1 ${latest.length ? "lg:grid-cols-3" : ""} gap-10 py-8 mb-12`}>
        <article className={latest.length ? "lg:col-span-2 lg:border-r lg:border-border lg:pr-10" : "max-w-5xl mx-auto w-full"}>
          <NewsPhoto article={hero} priority />
          <Link to={articlePath(hero)} className="group block">
            <p className="text-primary text-xs uppercase font-bold tracking-widest mb-3">{hero.category}</p>
            <h2 className="font-serif font-black text-3xl md:text-5xl leading-tight mb-4 group-hover:text-primary">{hero.title}</h2>
            <p className="font-serif text-lg text-muted-foreground leading-relaxed mb-5">{hero.aiSummary || hero.snippet}</p>
          </Link>
          <p className="text-xs text-muted-foreground">{hero.sourceName} · <time dateTime={hero.publishedAt}>{newsDate(hero.publishedAt)}</time></p>
        </article>
        {latest.length > 0 && <section aria-labelledby="latest-heading" className="space-y-6">
          <h2 id="latest-heading" className="font-old-english text-3xl font-bold">Latest reports</h2>
          {latest.map(article => <ReportCard key={article.id} article={article} />)}
        </section>}
      </div>
      {grouped.filter(section => section.reports.length).map(section => <section key={section.title} className="mb-14 pt-8 border-t-4 border-double border-foreground">
        <div className="flex justify-between items-end gap-4 mb-7">
          <h2 className="font-old-english text-3xl md:text-4xl font-bold">{section.title}</h2>
          <Link to={section.path} className="text-xs uppercase font-bold text-muted-foreground hover:text-primary">Browse section →</Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">{section.reports.map(article => <ReportCard key={article.id} article={article} />)}</div>
      </section>)}
      {wire.length > 0 && <section className="mb-12 pt-8 border-t-4 border-double border-foreground">
        <h2 className="font-old-english text-4xl font-bold mb-7">More reports</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">{wire.map(article => <ReportCard key={article.id} article={article} />)}</div>
      </section>}
      <div className="text-center border-t border-border py-8"><Link to="/archives" className="font-bold underline underline-offset-4">Browse all published reports</Link></div>
    </>}
  </div>;
}
