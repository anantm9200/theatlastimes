import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import SeoHead, { browserSiteOrigin } from "../lib/SeoHead";
import { articlePath, collectionStructuredData } from "../lib/seo";
import { newsAge, readNews } from "../lib/newsApi";
import NewsPhoto from "../components/NewsPhoto";
import NewsReportCard from "../components/NewsReportCard";
import type { Article } from "../types";

const PAGE_SIZE=48;
export default function Feed() {
  const { id } = useParams();
  const location = useLocation();
  const [articles,setArticles]=useState<Article[]>([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState("");
  const [page,setPage]=useState(1),[hasMore,setHasMore]=useState(false);
  const isRegion=location.pathname.startsWith("/region/");
  const label=(id||"global").replace(/-/g," ").replace(/\b\w/g,letter=>letter.toUpperCase());
  const title=id==="global"||id==="feed"?"Global news":isRegion?`${label} news`:`${label} news`;
  const query=(targetPage:number)=>{
    const params=new URLSearchParams({limit:String(PAGE_SIZE),page:String(targetPage)});
    if(id && id!=="global" && id!=="feed")params.set(isRegion?"region":"category",id.replace(/-/g," "));
    return `/api/news?${params}`;
  };
  useEffect(()=>{
    const controller=new AbortController();
    setArticles([]);setLoading(true);setError("");setPage(1);
    readNews<Article[]>(query(1),controller.signal)
      .then(data=>{if(!controller.signal.aborted){setArticles(data);setHasMore(data.length===PAGE_SIZE);setLoading(false);}})
      .catch(err=>{if(!controller.signal.aborted){setError(err.message);setLoading(false);}});
    return ()=>controller.abort();
  },[id,isRegion]);
  async function more(){
    setLoading(true);
    try {
      const next=page+1,data=await readNews<Article[]>(query(next));
      setArticles(current=>[...new Map([...current,...data].map(item=>[item.id,item])).values()]);
      setPage(next);setHasMore(data.length===PAGE_SIZE);setError("");
    }catch(err){setError(err instanceof Error?err.message:"Unable to load reports");}
    finally{setLoading(false);}
  }
  const lead=articles[0];
  return <div className="pb-16 w-full">
    <SeoHead title={title} description={`Source-attributed ${title.toLowerCase()} and related developments from The Atlas Times.`} structuredData={collectionStructuredData(title,location.pathname,articles,browserSiteOrigin())} />
    <header className="border-b-4 border-double border-foreground pb-7 pt-7 mb-9">
      <p className="font-bold text-primary uppercase tracking-[.24em] text-xs mb-3">The Atlas Times / Editorial desk</p>
      <h1 className="font-serif font-bold text-4xl sm:text-6xl">{title}</h1>
      <p className="text-sm mt-4 text-muted-foreground">Published reports, primary source links and clearly marked AI-assisted context.</p>
    </header>
    {loading&&!articles.length?<p role="status" className="py-16">Loading source-verified reports…</p>:
     error&&!articles.length?<p role="alert" className="py-16 text-red-700">{error}</p>:
     !lead?<div className="py-16 border-l-4 pl-6">
       <h2 className="font-serif text-2xl font-bold">No published reports in this desk yet</h2>
       <p className="mt-3 text-muted-foreground">This section will populate when approved source reporting passes publication checks. We won't invent stories to fill it.</p>
       <Link to="/latest" className="mt-5 block underline font-bold">Read latest reports →</Link>
     </div>:<>
       <div className="grid md:grid-cols-2 gap-8 border-b border-border pb-10 mb-10 items-center">
         <Link to={articlePath(lead)}><NewsPhoto article={lead} priority /></Link>
         <div><p className="text-xs uppercase tracking-widest text-primary font-bold mb-3">Lead report · {lead.category}</p>
           <Link to={articlePath(lead)} className="hover:text-primary"><h2 className="font-serif font-black text-3xl sm:text-4xl leading-tight">{lead.title}</h2></Link>
           <p className="mt-5 font-serif text-muted-foreground line-clamp-5">{lead.aiSummary||lead.snippet}</p>
           <p className="mt-5 text-xs text-muted-foreground">{lead.sourceName} · {newsAge(lead.publishedAt)}</p>
         </div>
       </div>
       <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-8">{articles.slice(1).map((a,i)=><NewsReportCard key={a.id} article={a} image={i<3||i%8===0} compact />)}</div>
       {hasMore&&<div className="text-center mt-10"><button onClick={()=>void more()} type="button" disabled={loading} className="border border-foreground px-8 py-3 text-sm font-bold uppercase hover:bg-foreground hover:text-background disabled:opacity-40">{loading?"Loading…":"Load more reports"}</button></div>}
       {error&&<p role="alert" className="text-red-700 mt-5">{error}</p>}
     </>}
  </div>;
}
