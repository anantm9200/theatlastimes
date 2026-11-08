import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Article } from "../types";
import SeoHead, { browserSiteOrigin } from "../lib/SeoHead";
import NewsPhoto from "../components/NewsPhoto";
import NewsReportCard from "../components/NewsReportCard";
import { articlePath, collectionStructuredData, DEFAULT_DESCRIPTION } from "../lib/seo";
import { newsAge, newsDate, readNews } from "../lib/newsApi";
import { frontPageSelection, NEWS_DESKS, reportAgeHours } from "../lib/frontPageSelection";

export default function Home() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshedAt, setRefreshedAt] = useState(Date.now());
  useEffect(() => {
    const controller = new AbortController();
    // Revalidate as readers stay on the page. No background or fabricated updates.
    async function load() {
      try {
        const news = await readNews<Article[]>("/api/news?limit=240", controller.signal);
        if (!controller.signal.aborted) { setArticles(news); setError(""); setRefreshedAt(Date.now()); }
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "News service unavailable");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    const refresh = setInterval(() => { if (!document.hidden) void load(); }, 120_000);
    return () => { controller.abort(); clearInterval(refresh); };
  }, []);
  const desk = useMemo(() => frontPageSelection(articles, refreshedAt), [articles, refreshedAt]);
  const { hero, latest, breaking, sectioned, remaining, hasFresh } = desk;
  const heroBreaking = hero && breaking.some(item => item.id === hero.id);
  const firstSections = sectioned.filter(section => section.reports.length);
  return <div className="w-full bg-background text-foreground">
    <SeoHead description={DEFAULT_DESCRIPTION} path="/" structuredData={collectionStructuredData("Global news and analysis", "/", articles, browserSiteOrigin())} />
    <h1 className="sr-only">The Atlas Times — Global news and verified source reporting</h1>

    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b-2 border-foreground pb-5 mb-7">
      <div>
        <p className="text-primary font-bold uppercase tracking-[.22em] text-[11px] mb-2">The global newsroom</p>
        <h2 className="font-serif text-3xl sm:text-4xl font-bold">The news desk</h2>
        <p className="text-sm text-muted-foreground mt-2">Reporting from named sources. Independent editorial checks before every automatic publication.</p>
      </div>
      <div className="flex gap-4 text-xs font-bold uppercase tracking-wide shrink-0">
        <Link to="/latest" className="hover:text-primary underline underline-offset-4">Latest updates</Link>
        <Link to="/live" className="hover:text-primary underline underline-offset-4">Breaking desk</Link>
        <Link to="/sources" className="hover:text-primary underline underline-offset-4">Source directory</Link>
      </div>
    </div>

    {loading && !articles.length ? <p className="py-20 text-center text-lg font-serif" role="status">Retrieving the latest verified reports…</p> :
     error && !articles.length ? <div role="alert" className="border border-red-600 p-7"><p className="font-bold">The newsroom feed is temporarily unavailable.</p><p className="mt-2">{error}</p><Link to="/archives" className="underline block mt-4">Browse the archive</Link></div> :
     !hero ? <section className="py-20 text-center"><h2 className="font-serif text-3xl">No published reports yet</h2><p className="mt-4 text-muted-foreground">Publication is waiting for properly sourced and validated reporting.</p></section> : <>
      {!hasFresh && <div role="status" className="border-l-4 border-amber-700 bg-amber-50 text-amber-950 px-4 py-3 mb-7 text-sm">
        <strong>Newsroom update:</strong> The newest published report is {newsAge(desk.newest!.publishedAt)}. There is no verified fresh report to present as breaking news.
        <Link to="/latest" className="underline ml-2">View latest published coverage</Link>
      </div>}
      {breaking.length ? <section aria-label="Verified breaking news" className="border-y-2 border-[#b91c1c] py-3 mb-6 flex gap-4 items-center">
        <span className="bg-[#b91c1c] text-white px-3 py-2 font-bold text-xs uppercase tracking-widest shrink-0">Breaking</span>
        <div className="min-w-0 flex flex-wrap gap-x-6 gap-y-1">{breaking.slice(0,3).map(item => <Link className="font-serif font-bold hover:underline" to={articlePath(item)} key={item.id}>{item.title}</Link>)}</div>
      </section> : null}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.75fr)_minmax(280px,1fr)] gap-8 lg:gap-10 mb-12">
        <article className="min-w-0">
          <NewsPhoto article={hero} priority />
          <div className="flex items-center gap-3 mt-5 mb-3">
            <span className={`font-bold text-xs uppercase tracking-widest ${heroBreaking ? "text-red-700" : "text-primary"}`}>{heroBreaking ? "Verified breaking" : reportAgeHours(hero,refreshedAt) > 36 ? "From the news archive" : "Top report"}</span>
            <span className="text-xs text-muted-foreground">{hero.category}</span>
          </div>
          <Link to={articlePath(hero)} className="group">
            <h2 className="font-serif font-black text-[clamp(2rem,4.4vw,4.4rem)] leading-[1.08] tracking-tight group-hover:text-primary">{hero.title}</h2>
            <p className="mt-4 font-serif text-base sm:text-lg text-muted-foreground leading-relaxed line-clamp-4">{hero.aiSummary || hero.snippet}</p>
          </Link>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-5 text-xs text-muted-foreground">
            <span>{hero.sourceName}</span><span>{newsDate(hero.publishedAt)}</span><a href={hero.originalUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Original reporting</a>
          </div>
        </article>
        <aside aria-labelledby="latest-reports-title" className="min-w-0 lg:border-l lg:pl-8 border-border">
          <div className="flex items-baseline justify-between gap-2 border-b-2 border-foreground pb-4">
            <h2 id="latest-reports-title" className="font-serif text-3xl font-bold">Top stories</h2>
            <Link to="/latest" className="text-xs font-bold uppercase tracking-wide hover:text-primary">All reports →</Link>
          </div>
          <div className="divide-y divide-border">
            {latest.slice(0,6).map(item => <article key={item.id} className="py-4">
              <Link to={articlePath(item)} className="group">
                <p className="text-[11px] uppercase tracking-widest font-bold text-primary mb-1">{item.category}</p>
                <h3 className="font-serif font-bold text-lg lg:text-xl leading-tight group-hover:text-primary">{item.title}</h3>
              </Link>
              <p className="text-xs mt-2 text-muted-foreground">{item.sourceName} · {newsAge(item.publishedAt)}</p>
            </article>)}
          </div>
        </aside>
      </div>

      {latest.length > 0 && <section className="border-t-4 border-double border-foreground pt-7 mb-14">
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="font-serif font-bold text-3xl sm:text-4xl">Across the newsroom</h2>
          <Link to="/topics" className="text-xs font-bold uppercase tracking-widest underline">Explore desks</Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-8">{latest.slice(0,4).map((article,i) => <NewsReportCard key={article.id} article={article} image={i<2} compact />)}</div>
      </section>}

      <div className="border-t-4 border-double border-foreground pt-7 mb-12">
        <div className="flex items-baseline justify-between gap-3 mb-6">
          <h2 className="font-serif text-3xl sm:text-4xl font-bold">News by section</h2>
          <Link className="text-xs uppercase font-bold underline underline-offset-4" to="/topics">All nine desks →</Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {NEWS_DESKS.map(section => <Link key={section.slug} to={`/category/${section.slug}`}
            className="border border-border px-4 py-4 hover:bg-foreground hover:text-background group">
            <span className="font-serif font-bold text-lg block">{section.title}</span>
            <span className="block mt-2 text-xs opacity-70">{sectioned.find(d=>d.slug===section.slug)?.count || 0} published</span>
          </Link>)}
        </div>
      </div>

      {firstSections.map(section => <section key={section.slug} aria-labelledby={`section-${section.slug}`} className="border-t-4 border-double border-foreground pt-6 mb-12">
        <div className="flex items-end justify-between mb-6 gap-5">
          <div><p className="text-xs uppercase tracking-widest text-primary mb-2">{section.kicker}</p><h2 id={`section-${section.slug}`} className="font-serif font-bold text-3xl sm:text-4xl">{section.title}</h2></div>
          <Link to={`/category/${section.slug}`} className="text-xs font-bold uppercase tracking-widest underline shrink-0">See all →</Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-7">
          {section.reports.map((article,i) => <NewsReportCard article={article} key={article.id} compact image={i===0} />)}
        </div>
      </section>)}

      {remaining.length > 0 && <section className="border-t-4 border-double border-foreground pt-7 mb-14">
        <div className="flex items-baseline justify-between mb-5"><h2 className="font-serif font-bold text-3xl">The latest wire</h2><Link to="/archives" className="text-xs font-bold underline">Full archive →</Link></div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-5">{remaining.map(item => <NewsReportCard key={item.id} article={item} compact />)}</div>
      </section>}
      <div className="border-t border-border pt-8 pb-10 text-center">
        <Link to="/archives" className="inline-block bg-foreground text-background px-8 py-4 text-sm font-bold uppercase tracking-widest hover:bg-primary">Browse every published report →</Link>
      </div>
    </>}
  </div>;
}
