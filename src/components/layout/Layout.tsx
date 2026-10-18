import { Outlet, Link, useLocation } from "react-router-dom";
import { Search, User, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Article } from "../../types";
import { articlePath } from "../../lib/seo";
import { readNews } from "../../lib/newsApi";

export default function Layout() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [latestNews, setLatestNews] = useState<Article[]>([]);
  const categories = ["World", "Business", "Economy", "Finance", "Politics", "Technology", "AI"];

  useEffect(() => {
    const controller = new AbortController();
    readNews<Article[]>("/api/news?limit=5", controller.signal)
      .then(data => { if (!controller.signal.aborted) setLatestNews(data); })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  return (
    <div className="min-h-screen print:min-h-0 bg-background flex flex-col print:block font-sans w-full mx-auto px-2 sm:px-4 lg:px-8 print:px-0">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] bg-background p-3 border border-foreground">Skip to content</a>
      <header className="bg-background pt-0 print:hidden">
        {latestNews.length > 0 && <div aria-label="Latest reports" className="bg-[#cc0000] text-white py-2 flex items-center text-xs font-bold border-b-2 border-black">
          <span className="px-3 shrink-0 uppercase tracking-widest">Latest</span>
          <div className="flex gap-8 overflow-x-auto whitespace-nowrap px-3">
            {latestNews.map(article => <Link key={article.id} to={articlePath(article)} className="hover:underline focus:underline">{article.title}</Link>)}
          </div>
        </div>}
        <div className="flex justify-between items-center text-[10px] sm:text-xs uppercase tracking-widest font-bold border-b border-border py-2 gap-4">
          <span>Global Edition</span>
          <span>News, sources &amp; analysis</span>
        </div>
        <div className="flex flex-wrap justify-between items-center gap-4 py-5 border-b-2 border-foreground text-xs font-bold">
          <button aria-label={menuOpen ? "Close sections menu" : "Open sections menu"} aria-expanded={menuOpen} aria-controls="sections-menu" onClick={() => setMenuOpen(open => !open)} className="flex items-center gap-2 hover:text-primary">
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}<span className="hidden sm:inline">Sections</span>
          </button>
          <Link to="/" className="text-3xl sm:text-4xl md:text-6xl font-old-english font-bold tracking-tight text-foreground">The Atlas Times</Link>
          <div className="flex gap-4 items-center">
            <Link to="/archives" aria-label="Search the archives" className="hover:text-primary"><Search className="w-5 h-5" /></Link>
            <Link to="/briefcase" className="hidden sm:block hover:text-primary">Briefcase</Link>
            <Link to="/preferences" aria-label="Reader preferences" className="hover:text-primary"><User className="w-5 h-5" /></Link>
          </div>
        </div>
        <nav aria-label="News categories" className="flex justify-start md:justify-center gap-5 md:gap-8 py-4 border-b-4 border-double border-foreground overflow-x-auto text-xs font-bold">
          {categories.map(category => <Link key={category} to={`/category/${category.toLowerCase()}`} className="hover:text-primary whitespace-nowrap">{category}</Link>)}
        </nav>
        {menuOpen && <nav id="sections-menu" aria-label="All sections" className="border-b border-foreground py-6 grid grid-cols-2 sm:grid-cols-4 gap-5">
          {categories.map(category => <Link key={category} to={`/category/${category.toLowerCase()}`} className="font-serif text-lg hover:text-primary">{category}</Link>)}
          <Link to="/archives" className="hover:text-primary">Archives</Link>
          <Link to="/briefcase" className="hover:text-primary">Briefcase</Link>
          <Link to="/about" className="hover:text-primary">About</Link>
          <Link to="/editorial-policy" className="hover:text-primary">Editorial policy</Link>
          <Link to="/editorial" className="hover:text-primary">Editorial desk</Link>
        </nav>}
      </header>
      <main id="main-content" tabIndex={-1} className="flex-1 print:flex-none w-full bg-background pt-4 pb-20 print:pb-0 print:pt-0">
        <Outlet />
      </main>
      <footer className="py-12 px-6 bg-zinc-950 text-zinc-300 border-t-4 border-foreground print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 text-sm">
          <div>
            <p className="font-serif text-2xl text-zinc-100 font-bold mb-4">The Atlas Times</p>
            <p className="leading-relaxed">Global news with linked sources and clearly labeled AI-assisted summaries. Follow the original publisher for the full report.</p>
            <p className="text-xs mt-6">© {new Date().getFullYear()} The Atlas Times</p>
          </div>
          <nav aria-label="Footer sections" className="flex flex-col gap-3">
            <p className="font-bold uppercase tracking-widest text-zinc-100 mb-2">Sections</p>
            {categories.map(category => <Link key={category} to={`/category/${category.toLowerCase()}`} className="hover:text-white">{category}</Link>)}
          </nav>
          <nav aria-label="Publication information" className="flex flex-col gap-3">
            <p className="font-bold uppercase tracking-widest text-zinc-100 mb-2">Publication</p>
            <Link to="/about" className="hover:text-white">About The Atlas Times</Link>
            <Link to="/editorial-policy" className="hover:text-white">Sources, AI &amp; corrections</Link>
            <Link to="/archives" className="hover:text-white">Archives</Link>
            <Link to="/editorial" className="hover:text-white">Editorial desk</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
