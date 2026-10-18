import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import SeoHead, { browserSiteOrigin } from "../lib/SeoHead";
import { articleDescription, articlePath, articleStructuredData, safeExternalUrl } from "../lib/seo";
import { newsDate, newsImage, readNews } from "../lib/newsApi";
import { Article } from "../types";
import { Badge } from "@/components/ui/badge";
import DOMPurify from 'dompurify';
import { Bookmark, BookmarkCheck, Printer } from "lucide-react";
import { useBriefcase } from "../lib/useBriefcase";

export default function ArticleView() {
  const { id } = useParams();
  const [article, setArticle] = useState<Article | null>(null);
  const [related, setRelated] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  
  const { isSaved, saveArticle, removeArticle } = useBriefcase();

  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setArticle(null);
    setRelated([]);
    setError("");
    readNews<Article>(`/api/news/${encodeURIComponent(id || "")}`, controller.signal)
      .then(async (data) => {
        if (controller.signal.aborted) return;
        setArticle(data);
        setLoading(false);
        if (data.category) {
          const query = new URLSearchParams({ category: data.category, limit: "5" });
          const matches = await readNews<Article[]>(`/api/news?${query}`, controller.signal);
          if (!controller.signal.aborted) setRelated(matches.filter(item => item.id !== data.id).slice(0, 4));
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err.message || "Unable to load this report.");
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [id]);

  if (loading) return <><SeoHead title="Loading report" /><div role="status" className="py-20 text-center font-serif text-xl animate-pulse">Loading report…</div></>;
  if (!article) return <><SeoHead title="Report unavailable" noindex /><div role="alert" className="py-20 text-center font-serif text-xl border-t border-border mt-10"><h1>Report unavailable</h1><p>{error || "This report could not be found."}</p><Link to="/archives" className="underline">Browse the archives</Link></div></>;
  const originalUrl = safeExternalUrl(article.originalUrl);
  const sourceImage = newsImage(article);
  const saved = isSaved(article.id);
  const additionalSources = [...new Set((article.provenance?.sourceUrls || []).map(safeExternalUrl).filter((url): url is string => !!url && url !== originalUrl))];

  return (
    <article className="w-full max-w-[1800px] mx-auto space-y-10 py-8 px-4 lg:px-8">
       <SeoHead title={article.title} description={articleDescription(article)} path={articlePath(article)} image={sourceImage === "/news-placeholder.svg" ? undefined : sourceImage} article structuredData={articleStructuredData(article, browserSiteOrigin())} />

       {/* Meta */}
       <div className="flex items-center space-x-3 text-xs uppercase tracking-widest font-bold">
           <Link to={`/category/${encodeURIComponent(article.category.toLowerCase())}`} className="text-primary hover:underline">{article.category}</Link>
           <span className="text-muted-foreground">&bull;</span>
           <span className="text-muted-foreground">{article.region}</span>
       </div>

       {/* Title */}
       <div className="hidden print:block mb-8 border-b-4 border-double border-black pb-4">
           <p className="text-4xl font-old-english font-black text-black">The Atlas Times</p>
           <div className="flex justify-between items-center text-xs uppercase font-bold tracking-widest mt-2 border-t border-black pt-2">
               <span>Printed: {new Date().toLocaleDateString()}</span>
               <span>Global Intelligence Archive</span>
           </div>
       </div>

       <h1 className="text-4xl md:text-6xl font-serif font-black leading-tight tracking-tight text-foreground print:text-5xl print:text-black">
         {article.title}
       </h1>
       
       <div className="w-full mt-8 flex flex-col group">
           <div className="w-full aspect-video md:aspect-[21/9] overflow-hidden border border-border relative">
               <img src={sourceImage} alt={sourceImage === "/news-placeholder.svg" ? "No source image available" : article.imageCaption || article.title} width="1200" height="675" fetchPriority="high" decoding="async" className="w-full h-full object-cover grayscale" />
           </div>
           {sourceImage !== "/news-placeholder.svg" && (article.imageSource || article.imageCredit) && (
               <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-2 text-right">
                   Image: {article.imageCredit && <span className="font-bold">{article.imageCredit} </span>}
                   {article.imageSource && <span>({article.imageSource})</span>}
                   {article.imageLicense && <span> · {article.imageLicense}</span>}
               </div>
           )}
       </div>

       {/* Byline */}
       <div className="flex items-center justify-between py-6 border-y border-border mt-8">
          <div className="flex flex-col">
             <span className="font-medium text-sm">{originalUrl ? <>Source: <a href={originalUrl} target="_blank" rel="noopener noreferrer" className="font-bold underline decoration-primary underline-offset-4">{article.sourceName}</a></> : `Published by ${article.sourceName || "The Atlas Times"}`}</span>
             {article.authorName && <span className="text-sm mt-1">By {article.authorName}</span>}
             <span className="text-xs text-muted-foreground mt-1">Published: <time dateTime={article.publishedAt}>{newsDate(article.publishedAt, "MMMM d, yyyy 'at' h:mm a")}</time></span>
             {article.modifiedAt && article.modifiedAt !== article.publishedAt && <span className="text-xs text-muted-foreground mt-1">Updated: <time dateTime={article.modifiedAt}>{newsDate(article.modifiedAt, "MMMM d, yyyy 'at' h:mm a")}</time></span>}
             {article.sourcePublishedAt && <span className="text-xs text-muted-foreground mt-1">Source published: <time dateTime={article.sourcePublishedAt}>{newsDate(article.sourcePublishedAt, "MMMM d, yyyy 'at' h:mm a")}</time></span>}
             {article.aiGenerated && <span className="text-xs text-muted-foreground mt-1">AI-assisted summary · <Link to="/editorial-policy" className="underline">Sources and review policy</Link></span>}
          </div>
          <div className="flex space-x-4 items-center">
             <Badge variant="outline" className="text-xs uppercase scale-90 hidden sm:inline-flex print:hidden">Analysis</Badge>
             <button 
                 onClick={async () => {
                     try {
                         await navigator.clipboard.writeText(window.location.href);
                         alert("Link copied to clipboard. Make sure to paste it with https:// included!");
                     } catch (err) {
                         console.error("Failed to copy link", err);
                     }
                 }}
                 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors print:hidden"
                 title="Copy Link" aria-label="Copy article link"
             >
                 <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-share-2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>
                 <span className="hidden sm:inline">Share</span>
             </button>
             <button 
                 onClick={() => {
                     if (window.top !== window.self) {
                         // Inside iframe: alert user to use standard pop-out
                         alert("To print, please open this app in a new tab first using the 'Open in new tab' button at the top right of the preview pane.");
                     } else {
                         window.print();
                     }
                 }}
                 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors print:hidden group relative"
                 title="Print Article" aria-label="Print article"
             >
                 <Printer className="w-5 h-5" />
                 <span className="hidden sm:inline">Print</span>
                 
                 {/* Tooltip for iframe users */}
                 <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black text-white text-[10px] py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded">
                     Use the top-right button to open in a new tab first
                 </div>
             </button>
             <button 
                 aria-label={saved ? "Remove article from briefcase" : "Save article to briefcase"}
                 aria-pressed={saved}
                 onClick={() => saved ? removeArticle(article.id) : saveArticle(article.id)}
                 className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest transition-colors ${saved ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}
             >
                 {saved ? <BookmarkCheck className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
                 <span className="hidden sm:inline">{saved ? 'Saved' : 'Save'}</span>
             </button>
          </div>
       </div>

       {/* AI Summary Section - Premium Look */}
       {(article.aiSummary || article.detailedHumanizedSummary) && <section aria-labelledby="summary-heading" className="bg-muted/30 border-l-4 border-primary p-6 md:p-10 rounded shadow-sm">
           <div className="flex items-center space-x-2 mb-6">
              <div className="w-4 h-4 bg-primary text-primary-foreground flex items-center justify-center rounded-sm">
                 <div className="w-1.5 h-1.5 bg-background rounded-full"></div>
              </div>
              <h2 id="summary-heading" className="font-sans font-bold uppercase tracking-wider text-sm opacity-80">{article.aiGenerated ? "AI-assisted summary" : "Summary"}</h2>
           </div>
           
           {article.detailedHumanizedSummary ? (
               <div className="font-serif text-lg md:text-xl leading-relaxed text-foreground opacity-90 mb-8 max-w-none prose prose-p:mb-4">
                   {article.detailedHumanizedSummary.split('\n').map((paragraph, idx) => (
                       <p key={idx}>{paragraph}</p>
                   ))}
               </div>
           ) : (
               <p className="font-serif text-xl md:text-2xl leading-relaxed text-foreground opacity-90 mb-8">
                   {article.aiSummary}
               </p>
           )}

           {(article.keyPoints?.length || article.whyItMatters) ? <div className="grid grid-cols-1 md:grid-cols-2 gap-10 border-t border-border/50 pt-8 mt-8">
               <div>
                   <h3 className="font-bold text-sm uppercase tracking-wider mb-4 border-b border-border/50 pb-2">Key points</h3>
                   <ul className="space-y-3 font-serif text-muted-foreground list-disc pl-5">
                       {article.keyPoints?.map((pt, i) => (
                           <li key={i} className="leading-relaxed">{pt}</li>
                       ))}

                   </ul>
               </div>
               <div>
                   <h3 className="font-bold text-sm uppercase tracking-wider mb-4 border-b border-border/50 pb-2">Context</h3>
                   <p className="font-serif text-muted-foreground leading-relaxed">
                       {article.whyItMatters || "No additional context is available."}
                   </p>
               </div>
           </div> : null}
       </section>}

       {/* Full Article Content */}
       <div className="article-content py-8 border-y border-border [&>p]:mb-6 [&>p]:font-serif [&>p]:text-xl [&>p]:leading-relaxed [&>p]:text-foreground/90 [&>h1]:text-4xl [&>h1]:font-bold [&>h1]:mt-10 [&>h1]:mb-4 [&>h1]:font-serif [&>h2]:text-3xl [&>h2]:font-bold [&>h2]:mt-10 [&>h2]:mb-4 [&>h2]:font-serif [&>h3]:text-2xl [&>h3]:font-bold [&>h3]:mt-6 [&>h3]:mb-4 [&>h3]:font-serif [&>ul]:list-disc [&>ul]:pl-6 [&>ul]:mb-6 [&>ul>li]:mb-2 [&>ol]:list-decimal [&>ol]:pl-6 [&>ol]:mb-6 [&>ol>li]:mb-2 [&_strong]:font-black"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.fullContent || "<p>Full content unavailable in feed.</p>") }}
       />

       {/* Context & Outbound */}
       {originalUrl && (
       <div className="py-10 text-center flex flex-col items-center print:hidden">
          <p className="text-sm text-muted-foreground italic mb-6 max-w-2xl px-4 border border-border bg-card py-3">
             This report links to the original publisher. AI-assisted summaries can contain errors and do not represent independent verification. <Link to="/editorial-policy" className="underline">How we publish</Link>.
          </p>
          <a href={originalUrl} target="_blank" rel="noopener noreferrer" className="inline-block bg-primary text-primary-foreground px-8 py-4 font-bold uppercase tracking-wider text-sm hover:opacity-90 shadow-sm transition-colors rounded-none">
              Read Full Story on {article.sourceName}
          </a>
       </div>
       )}

       {additionalSources.length > 0 && <section className="border-t border-border pt-6"><h2 className="font-serif text-xl font-bold mb-4">Additional source references</h2><ul className="space-y-2 list-disc pl-5">{additionalSources.map(url => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer" className="underline break-words">{url}</a></li>)}</ul></section>}

       {/* Tags */}
       <div className="border-t border-border pt-6 flex flex-wrap gap-2 text-xs print:hidden">
          <span className="font-bold uppercase tracking-widest mr-2 py-1">Tags:</span>
          {(article.tags || []).map(tag => (
              <Badge key={tag} variant="secondary" className="uppercase">{tag}</Badge>
          ))}
          {article.sentiment && (
              <Badge variant="outline" className={`uppercase ${article.sentiment === 'positive' ? 'border-green-500 text-green-700' : article.sentiment === 'negative' ? 'border-red-500 text-red-700' : 'border-yellow-500 text-yellow-700'}`}>
                 {article.sentiment}
              </Badge>
          )}
       </div>

       {/* Related Reports */}
       {related.length > 0 && (
         <div className="mt-16 pt-12 border-t-[6px] border-double border-border pb-12 print:hidden">
            <h2 className="text-3xl font-old-english font-bold mb-8 text-foreground text-center">Related Reports</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {related.map(rel => (
                    <Link key={rel.id} to={articlePath(rel)} className="group flex flex-col border border-border bg-card hover:bg-muted/30 transition-colors p-4">
                       <span className="text-[10px] text-primary uppercase font-bold tracking-widest mb-2">{rel.category}</span>
                       <h3 className="font-serif font-bold text-lg mb-2 group-hover:underline text-foreground leading-snug">{rel.title}</h3>
                       <p className="text-sm text-foreground/80 line-clamp-3 leading-relaxed">{rel.aiSummary}</p>
                    </Link>
                ))}
            </div>
         </div>
       )}
    </article>
  );
}
