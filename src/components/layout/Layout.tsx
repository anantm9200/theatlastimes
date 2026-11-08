import { Outlet, Link, useLocation } from "react-router-dom";
import { Search, User, Menu, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Article } from "../../types";
import { articlePath } from "../../lib/seo";
import { readNews } from "../../lib/newsApi";
import { isConfirmedBreaking, NEWS_DESKS } from "../../lib/frontPageSelection";

const newsroomLinks = [
  { label: "Latest", path: "/latest" },
  { label: "Breaking", path: "/live" },
  { label: "Analysis", path: "/analysis" },
  { label: "All desks", path: "/topics" },
  { label: "Sources", path: "/sources" },
  { label: "Source wire", path: "/wire" },
  { label: "Archives", path: "/archives" },
];

export default function Layout() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [latestNews, setLatestNews] = useState<Article[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      try {
        const data = await readNews<Article[]>("/api/news?limit=30",controller.signal);
        if (!controller.signal.aborted) setLatestNews(data);
      } catch { /* Retain last verified headlines; do not fabricate updates. */ }
    }
    void refresh();
    const timer=setInterval(()=>{if(!document.hidden)void refresh();},120000);
    return () => { controller.abort(); clearInterval(timer); };
  }, []);
  useEffect(()=>{setMenuOpen(false);},[location.pathname]);
  useEffect(()=>{
    if(!menuOpen)return;
    function onKey(e:KeyboardEvent){if(e.key==="Escape")setMenuOpen(false);}
    window.addEventListener("keydown",onKey);
    return ()=>window.removeEventListener("keydown",onKey);
  },[menuOpen]);
  const breaking=useMemo(()=>latestNews.filter(article=>isConfirmedBreaking(article)),[latestNews]);
  const strip=breaking.length ? breaking.slice(0,5) : latestNews.slice(0,5);
  return <div className="min-h-screen bg-background flex flex-col print:block font-sans w-full mx-auto px-3 sm:px-5 lg:px-[1.5%] print:px-0">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] bg-background p-3 border border-foreground">Skip to content</a>
    <header className="bg-background print:hidden">
      {strip.length>0 && <div aria-label={breaking.length?"Confirmed breaking news":"Latest published reports"}
        className={`flex items-stretch min-h-9 text-white text-xs font-bold ${breaking.length?"bg-red-700":"bg-zinc-900"}`}>
        <Link to={breaking.length?"/live":"/latest"} className="shrink-0 uppercase tracking-widest px-4 flex items-center bg-black/15 hover:underline">
          {breaking.length?"Breaking":"Latest"}
        </Link>
        <div className="overflow-x-auto flex items-center gap-6 px-4 whitespace-nowrap motion-reduce:scroll-auto">
          {strip.map(article=><Link to={articlePath(article)} key={article.id} className="hover:underline">{article.title}</Link>)}
        </div>
      </div>}
      <div className="flex justify-between items-center text-[11px] sm:text-xs uppercase tracking-widest font-bold border-b border-border py-2 gap-3">
        <span>Global Edition</span><Link to="/editorial-policy" className="hover:underline">Sources, verification &amp; AI</Link>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-5 border-b-2 border-foreground">
        <button type="button" aria-label={menuOpen?"Close sections menu":"Open sections menu"} aria-expanded={menuOpen} aria-controls="sections-menu" onClick={()=>setMenuOpen(open=>!open)}
          className="flex items-center gap-2 text-xs font-bold hover:text-primary w-fit">
          {menuOpen?<X className="w-5 h-5"/>:<Menu className="w-5 h-5"/>}<span className="hidden sm:inline">Sections</span>
        </button>
        <Link to="/" className="font-old-english font-bold text-[clamp(1.9rem,4vw,4rem)] leading-tight tracking-tight whitespace-nowrap text-center">The Atlas Times</Link>
        <div className="justify-self-end flex gap-3 items-center text-xs font-bold">
          <Link to="/archives" aria-label="Search reports" title="Search reports" className="hover:text-primary"><Search className="w-5 h-5"/></Link>
          <Link to="/briefcase" className="hidden md:inline hover:text-primary">Briefcase</Link>
          <Link to="/preferences" aria-label="Reader preferences" className="hover:text-primary"><User className="w-5 h-5"/></Link>
        </div>
      </div>
      <nav aria-label="Newsroom navigation" className="flex gap-5 sm:gap-7 items-center py-3 border-b border-border overflow-x-auto text-xs uppercase tracking-wide font-bold">
        {newsroomLinks.map(link=><Link key={link.path} to={link.path} aria-current={location.pathname===link.path?"page":undefined}
          className={`shrink-0 hover:text-primary ${location.pathname===link.path?"underline underline-offset-4":""}`}>{link.label}</Link>)}
      </nav>
      <nav aria-label="Editorial sections" className="flex justify-start md:justify-center gap-5 md:gap-8 py-3 border-b-4 border-double border-foreground overflow-x-auto text-xs font-bold">
        {NEWS_DESKS.map(desk=><Link to={`/category/${desk.slug}`} key={desk.slug} className="whitespace-nowrap hover:text-primary">{desk.title}</Link>)}
      </nav>
      {menuOpen && <nav id="sections-menu" aria-label="All newsroom pages" className="border-b-2 border-foreground bg-background py-7 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5">
        {NEWS_DESKS.map(desk=><Link key={desk.slug} to={`/category/${desk.slug}`} className="font-serif font-bold text-lg hover:text-primary">{desk.title}</Link>)}
        {newsroomLinks.map(link=><Link key={link.path} to={link.path} className="font-semibold hover:text-primary">{link.label}</Link>)}
        <Link to="/about" className="hover:text-primary">About</Link>
        <Link to="/editorial-policy" className="hover:text-primary">Editorial policy</Link>
        <Link to="/editorial" className="hover:text-primary">Editorial desk</Link>
      </nav>}
    </header>
    <main id="main-content" tabIndex={-1} className="flex-1 print:flex-none w-full bg-background pt-5 pb-12 print:pb-0"><Outlet/></main>
    <footer className="border-t-4 border-foreground bg-zinc-950 text-zinc-200 px-5 sm:px-8 py-11 print:hidden">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-9">
        <div><h2 className="font-old-english font-bold text-3xl mb-4">The Atlas Times</h2><p className="text-sm text-zinc-400 leading-relaxed">A source-attributed global newsroom with carefully labeled AI-assisted reporting. Follow original publishers for primary evidence.</p><p className="text-xs text-zinc-500 mt-7">© {new Date().getFullYear()} The Atlas Times</p></div>
        <nav aria-label="Newsroom pages" className="flex flex-col gap-3 text-sm"><h3 className="text-xs tracking-widest uppercase font-bold text-white">Newsroom</h3>{newsroomLinks.map(item=><Link key={item.path} to={item.path} className="hover:text-white">{item.label}</Link>)}</nav>
        <nav aria-label="Sections" className="flex flex-col gap-3 text-sm"><h3 className="text-xs tracking-widest uppercase font-bold text-white">Sections</h3>{NEWS_DESKS.map(item=><Link key={item.slug} to={`/category/${item.slug}`} className="hover:text-white">{item.title}</Link>)}</nav>
        <nav aria-label="Publication information" className="flex flex-col gap-3 text-sm"><h3 className="text-xs tracking-widest uppercase font-bold text-white">Publication</h3><Link to="/about">About</Link><Link to="/editorial-policy">Sources &amp; corrections</Link><Link to="/editorial">Editorial desk</Link><Link to="/archives">Full archive</Link></nav>
      </div>
    </footer>
  </div>;
}
