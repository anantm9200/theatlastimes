import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import EditorialGate from "../components/EditorialGate";
import { editorialRequest } from "../lib/editorialApi";
import { newsDate } from "../lib/newsApi";
import type { Article } from "../types";
import PublisherSettings from "../components/PublisherSettings";

function Queue() {
  const location = useLocation();
  const [status, setStatus] = useState<"draft" | "published" | "archived">("draft");
  const [page, setPage] = useState(1);
  const [articles, setArticles] = useState<Article[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    editorialRequest<{ data: Article[]; total: number }>(`/api/admin/news?status=${status}&limit=40&page=${page}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) { setArticles(result.data); setTotal(result.total); setLoading(false); } })
      .catch(err => { if (!controller.signal.aborted) { setError(err.message); setLoading(false); } });
    return () => controller.abort();
  }, [status, page]);
  return <div className="max-w-5xl mx-auto px-4 py-12 space-y-7">
    <div className="flex flex-wrap justify-between gap-5"><h1 className="font-serif text-4xl font-bold">Editorial desk</h1><Link className="bg-foreground text-background px-5 py-3 font-bold" to="/new-news">Create report</Link></div>
    <p className="text-muted-foreground">Approved global source briefs can publish after automated checks. Held drafts need review. Publication labels distinguish automatic checks from human review.</p>
    <PublisherSettings />
    {typeof location.state?.message === "string" && <p role="status">{location.state.message}</p>}
    <div className="flex gap-3" role="group" aria-label="Report status">{(["draft", "published", "archived"] as const).map(value => <button key={value} aria-pressed={status === value} onClick={() => { setStatus(value); setPage(1); }} className={`px-5 py-2 border capitalize ${status === value ? "bg-foreground text-background" : ""}`}>{value}</button>)}</div>
    {loading ? <p role="status">Loading reports…</p> : error ? <p role="alert">{error}</p> : <>
      <p className="text-sm text-muted-foreground">{total} {status} reports</p>
      {articles.length === 0 ? <p>No reports in this queue.</p> : <div className="divide-y divide-border">{articles.map(article => <article key={article.id} className="py-6">
        <Link to={`/article/${encodeURIComponent(article.id)}/edit`} className="font-serif text-xl font-bold hover:underline">{article.title}</Link>
        <p className="text-sm text-muted-foreground mt-2">{article.sourceName} · {article.category} · {newsDate(article.modifiedAt || article.fetchedAt)}</p>
        <p className="mt-3 text-sm line-clamp-2">{article.aiSummary || article.snippet}</p>
        {article.aiGenerated && <p className="text-xs mt-2 font-bold">AI-assisted text · {article.publicationMode === "automatic" ? "automatically published after checks" : "editorial review"}</p>}
        {article.automationCheck?.verdict === "held" && <p className="text-xs mt-2">Held: {article.automationCheck.reason}</p>}
      </article>)}</div>}
      <div className="flex gap-5"><button disabled={page === 1} onClick={() => setPage(value => value - 1)} className="border px-4 py-2 disabled:opacity-40">Previous</button><span className="py-2">Page {page}</span><button disabled={page * 40 >= total} onClick={() => setPage(value => value + 1)} className="border px-4 py-2 disabled:opacity-40">Next</button></div>
    </>}
  </div>;
}
export default function Editorial() { return <EditorialGate><Queue /></EditorialGate>; }
