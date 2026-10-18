import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import type { Article } from "../types";
import ArticleForm from "../components/ArticleForm";
import EditorialGate from "../components/EditorialGate";
import { editorialRequest } from "../lib/editorialApi";
import AnalysisJobStatus, { type QueuedAnalysis } from "../components/AnalysisJobStatus";

function EditReport() {
  const { id } = useParams();
  const location = useLocation();
  const [article, setArticle] = useState<Article | null>(null);
  const [message, setMessage] = useState(typeof location.state?.message === "string" ? location.state.message : "");
  const [error, setError] = useState("");
  const [job, setJob] = useState<QueuedAnalysis | undefined>(typeof location.state?.job?.id === "string" ? location.state.job : undefined);
  useEffect(() => {
    const controller = new AbortController();
    setArticle(null); setError("");
    editorialRequest<{ data: Article }>(`/api/admin/news/${encodeURIComponent(id || "")}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setArticle(result.data); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [id]);
  return <div className="max-w-4xl mx-auto py-12 px-4 space-y-7">
    <h1 className="font-serif text-4xl font-bold">Edit report</h1>
    {message && <p role="status" className="border border-border p-4">{message}</p>}
    {job && <AnalysisJobStatus key={job.id} initial={job} onReload={async () => {
      const result = await editorialRequest<{ data: Article }>(`/api/admin/news/${encodeURIComponent(id || "")}`);
      setArticle(result.data); setJob(undefined); setMessage("Generated draft loaded. Review its claims and source attribution before publishing.");
    }} />}
    {error ? <p role="alert">{error}</p> : !article ? <p role="status">Loading report…</p> : <>
      <p className="text-sm uppercase tracking-widest">Status: {article.status}</p>
      <ArticleForm key={`${article.id}-${article.modifiedAt}`} initial={article} onSaved={(updated, status, queuedJob) => { setArticle(updated); setMessage(status); setJob(queuedJob); }} />
      <Link to={`/article/${encodeURIComponent(article.id)}/delete`} className="inline-block text-red-700 underline">Delete report</Link>
    </>}
  </div>;
}
export default function EditArticle() { return <EditorialGate><EditReport /></EditorialGate>; }
