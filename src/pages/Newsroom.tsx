import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Article } from "../types";
import SeoHead, { browserSiteOrigin } from "../lib/SeoHead";
import { articlePath, collectionStructuredData } from "../lib/seo";
import { newsAge, readNews } from "../lib/newsApi";
import { NEWS_DESKS, isConfirmedBreaking, reportAgeHours } from "../lib/frontPageSelection";
import NewsReportCard from "../components/NewsReportCard";

export type NewsroomMode = "latest" | "live" | "analysis" | "topics" | "sources" | "source";
const PAGE_SIZE = 100;
const titleFor = (mode: NewsroomMode) => ({
  latest:"Latest reports", live:"Breaking news desk", analysis:"Analysis & context",
  topics:"News desks", sources:"Source directory", source:"Source coverage",
})[mode];

export default function Newsroom({ mode }: { mode: NewsroomMode }) {
  const { id } = useParams();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [category, setCategory] = useState("all");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setArticles([]); setPage(1);
    readNews<Article[]>(`/api/news?limit=${PAGE_SIZE}&page=1`,controller.signal)
      .then(data => { if (!controller.signal.aborted) { setArticles(data); setHasMore(data.length===PAGE_SIZE); setLoading(false); } })
      .catch(e=>{if(!controller.signal.aborted){setError(e.message);setLoading(false);}});
    return ()=>controller.abort();
  }, [mode,id]);
  async function loadMore() {
    setLoading(true);
    try {
      const next = page+1;
      const data = await readNews<Article[]>(`/api/news?limit=${PAGE_SIZE}&page=${next}`);
      setArticles(current=>[...new Map([...current,...data].map(item=>[item.id,item])).values()]);
      setPage(next); setHasMore(data.length===PAGE_SIZE); setError("");
    } catch(e) {setError(e instanceof Error?e.message:"Unable to load more reports");}
    finally {setLoading(false);}
  }
  const now=Date.now();
  const sourceName=id || "";
  const sorted=useMemo(()=>[...articles].sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)),[articles]);
  const sourceNames=useMemo(()=>{
    const counts = new Map<string,number>();
    for(const report of sorted) counts.set(report.sourceName,(counts.get(report.sourceName)||0)+1);
    return [...counts.entries()].sort((a,b)=>b[1]-a[1]);
  },[sorted]);
  const selected=sorted.filter(article=>{
    if(mode==="live") return isConfirmedBreaking(article,now);
    if(mode==="analysis") return !!(article.whyItMatters && article.keyPoints?.length);
    if(mode==="source") return article.sourceName.toLowerCase()===sourceName.toLowerCase();
    if(mode==="latest" && category!=="all") return article.category.toLowerCase()===category;
    return true;
  });
  const title=mode==="source"?sourceName:titleFor(mode);
  const path=mode==="source"?`/source/${encodeURIComponent(sourceName)}`:`/${mode}`;
  return <div className="w-full pb-14">
    <SeoHead title={title} description={`Source-attributed ${title.toLowerCase()} from The Atlas Times newsroom. Published reporting is never labeled breaking without recent source evidence and editorial review.`}
      path={path} structuredData={collectionStructuredData(title,path,selected,browserSiteOrigin())}/>
    <header className="border-b-4 border-double border-foreground py-8 mb-8">
      <p className="text-primary text-xs uppercase tracking-[.25em] font-bold mb-3">The Atlas Times / Newsroom</p>
      <h1 className="font-serif font-bold text-4xl sm:text-6xl">{title}</h1>
      <p className="text-muted-foreground mt-4 max-w-3xl leading-relaxed">
        {mode==="live"?"A report appears here only when it is explicitly marked breaking, independently reviewed by an editor, and backed by recent source evidence.":
         mode==="sources"?"Browse named publishers used in our recent source-attributed reporting. This is not a directory of independently verified news organizations.":
         mode==="topics"?"Nine working editorial sections, each linked to its own reports and archive.":
         mode==="analysis"?"Source-attributed summaries with clearly distinguished context. AI-assisted notes are not independent verification.":
         "Follow reported developments by publication date, with a link to the original source for every report."}
      </p>
    </header>

    {loading && !articles.length ? <p role="status" className="py-14">Loading published coverage…</p> :
      error && !articles.length ? <p role="alert" className="py-10 text-red-700">{error}</p> : <>
      {mode==="topics" && <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {NEWS_DESKS.map(desk=>{
          const related=sorted.filter(a=>(desk.categories as readonly string[]).includes(a.category));
          return <section className="border border-border p-6" key={desk.slug}>
            <p className="text-xs text-primary uppercase tracking-widest mb-3">{related.length} recent reports</p>
            <h2 className="font-serif text-2xl font-bold">{desk.title}</h2><p className="text-sm mt-2 text-muted-foreground">{desk.kicker}</p>
            {related.slice(0,2).map(a=><Link to={articlePath(a)} className="block text-sm mt-4 font-semibold hover:text-primary" key={a.id}>{a.title}</Link>)}
            {related.length===0 && <p className="mt-4 text-xs text-muted-foreground">No published coverage in the current feed.</p>}
            <Link to={`/category/${desk.slug}`} className="block mt-6 underline font-bold text-xs uppercase tracking-wide">Open desk →</Link>
          </section>;
        })}
      </div>}

      {mode==="sources" && <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {sourceNames.map(([source,count])=><Link key={source} to={`/source/${encodeURIComponent(source)}`}
          className="border border-border p-6 hover:bg-muted/40">
          <h2 className="font-serif text-2xl font-bold">{source}</h2>
          <p className="text-muted-foreground mt-3 text-sm">{count} report{count===1?"":"s"} in the recent feed</p>
          <span className="underline block mt-4 text-xs font-bold uppercase">View attributed coverage →</span>
        </Link>)}
      </div>}

      {mode!=="sources" && mode!=="topics" && <>
        {mode==="latest" && <div className="flex gap-2 flex-wrap mb-8" aria-label="Filter latest reports by section">
          {["all",...NEWS_DESKS.filter(d=>d.categories.length===1).map(d=>d.slug),"business","technology","world","politics"].filter((x,i,a)=>a.indexOf(x)===i).map(value=><button type="button"
            key={value} onClick={()=>setCategory(value)} aria-pressed={category===value}
            className={`px-3 py-2 border text-xs uppercase font-bold tracking-wide ${category===value?"bg-foreground text-background":"border-border hover:border-foreground"}`}>{value==="all"?"All reports":value}</button>)}
        </div>}
        {mode==="live" && !selected.length && <div className="border-l-4 border-foreground bg-muted/30 p-6 mb-8">
          <h2 className="font-serif text-2xl font-bold">No confirmed breaking report at this time</h2>
          <p className="text-sm text-muted-foreground mt-2">We do not turn older articles or automated headlines into breaking-news alerts. Recent published reports remain available below.</p>
          <Link to="/latest" className="inline-block underline mt-4 font-bold">See latest coverage →</Link>
        </div>}
        {!selected.length && mode!=="live" && <div className="py-12 text-muted-foreground">No published reports match this selection yet. <Link to="/archives" className="underline">Search the archive</Link>.</div>}
        {selected.length>0 && <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-7 gap-y-8">
          {selected.map((article,i)=><NewsReportCard key={article.id} article={article} compact image={i<3 || i%6===0}/>)}
        </div>}
        {mode==="live" && !selected.length && <section className="mt-8 border-t pt-6">
          <h2 className="font-serif font-bold text-2xl mb-5">Recently published (not breaking)</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">{sorted.slice(0,6).map(article=><NewsReportCard key={article.id} article={article} compact />)}</div>
        </section>}
      </>}

      {hasMore && <div className="text-center pt-10"><button type="button" onClick={()=>void loadMore()} disabled={loading}
        className="border border-foreground py-3 px-8 font-bold text-sm uppercase hover:bg-foreground hover:text-background disabled:opacity-40">{loading?"Loading…":"Load more published reports"}</button></div>}
      {error && articles.length>0 && <p role="alert" className="mt-5 text-red-700">{error}</p>}
      <footer className="border-t border-border mt-12 pt-6 text-sm text-muted-foreground">
        News summaries are source-attributed. For primary evidence, open each report's original source. <Link to="/editorial-policy" className="underline">Editorial policy</Link>.
      </footer>
    </>}
  </div>;
}
