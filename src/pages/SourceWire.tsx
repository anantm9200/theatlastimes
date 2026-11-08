import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SeoHead from "../lib/SeoHead";
import NewsroomLoading from "../components/NewsroomLoading";
import type { SourceWireItem, SourceWireResult } from "../server/source-wire";

function timeSince(iso: string) {
  const age = Math.max(0,Date.now()-Date.parse(iso));
  const hours=Math.floor(age/3_600_000);
  return hours<1?"Less than an hour ago":hours<24?`${hours} hour${hours===1?"":"s"} ago`:`${Math.floor(hours/24)} days ago`;
}
export default function SourceWire() {
  const [wire,setWire]=useState<SourceWireItem[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
  useEffect(()=>{
    const controller=new AbortController();
    fetch("/api/source-wire",{signal:controller.signal})
      .then(async response=>{if(!response.ok)throw new Error("Source wire is temporarily unavailable");return response.json() as Promise<SourceWireResult>;})
      .then(result=>{if(!controller.signal.aborted){setWire(result.data||[]);setLoading(false);}})
      .catch(e=>{if(!controller.signal.aborted){setError(e.message);setLoading(false);}});
    return ()=>controller.abort();
  },[]);
  const grouped=[...new Set(wire.map(item=>item.category))].map(category=>({category,reports:wire.filter(item=>item.category===category)}));
  return <div className="pb-16 w-full">
    <SeoHead title="Official source wire" path="/wire" description="Recently published headlines from named official-source news feeds. These are external links, not independently verified Atlas Times articles." />
    <header className="py-8 border-b-4 border-double border-foreground mb-8">
      <p className="text-primary font-bold uppercase text-xs tracking-[.2em] mb-2">External reporting / Primary sources</p>
      <h1 className="font-serif font-black text-4xl sm:text-6xl">Official source wire</h1>
      <p className="text-sm text-muted-foreground mt-4 max-w-3xl">A direct feed of recent source headlines. This wire does not use AI to invent or rewrite events, and headlines are not verified breaking reports. Open the original publisher for the full story.</p>
    </header>
    {loading?<NewsroomLoading compact />:
    error?<p role="alert" className="text-red-700 py-10">{error}</p>:
    wire.length===0?<div className="border-l-4 border-border p-6"><p>No recent approved source headlines available. <Link to="/latest" className="underline">Browse published reports</Link>.</p></div>:
    grouped.map(group=><section key={group.category} className="mb-12">
      <h2 className="font-serif font-bold text-3xl border-b-2 border-foreground pb-4 mb-3">{group.category}</h2>
      <div className="divide-y divide-border">
        {group.reports.map(item=><article className="py-4 grid sm:grid-cols-[1fr_auto] items-start gap-4" key={item.url}>
          <div><a href={item.url} target="_blank" rel="noopener noreferrer" className="font-serif font-bold text-xl hover:text-primary">{item.title} ↗</a>
            <p className="mt-2 text-xs text-muted-foreground">{item.publisher} · {timeSince(item.publishedAt)} · External headline</p></div>
          <span className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground">Read at source</span>
        </article>)}
      </div>
    </section>)}
    <div className="border-t border-border py-7 text-sm text-muted-foreground">
      To read Atlas Times articles that have passed publication checks, visit <Link to="/latest" className="underline">Latest reports</Link>.
    </div>
  </div>;
}
