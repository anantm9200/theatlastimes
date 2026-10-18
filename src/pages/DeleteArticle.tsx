import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Article } from "../types";
import EditorialGate from "../components/EditorialGate";
import { editorialRequest } from "../lib/editorialApi";

function DeleteReport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [article, setArticle] = useState<Article | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    editorialRequest<{ data: Article }>(`/api/admin/news/${encodeURIComponent(id || "")}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setArticle(result.data); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [id]);
  const remove = async () => {
    setBusy(true); setError("");
    try { await editorialRequest(`/api/news/${encodeURIComponent(id || "")}`, { method: "DELETE" }); navigate("/editorial", { state: { message: "Report deleted." } }); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to delete report."); setBusy(false); }
  };
  return <div className="max-w-2xl mx-auto py-14 px-4 space-y-6">
    <h1 className="font-serif text-4xl font-bold">Delete report</h1>
    {error && <p role="alert">{error}</p>}
    {!article ? !error && <p role="status">Loading report…</p> : <>
      <h2 className="font-serif text-2xl font-bold">{article.title}</h2>
      <p>Deletion removes this report and cannot be undone. You can archive a report from the edit page to keep a private copy.</p>
      <div className="flex gap-5"><Link to={`/article/${encodeURIComponent(article.id)}/edit`} className="border px-5 py-3">Cancel</Link><button disabled={busy} onClick={remove} className="bg-red-700 text-white px-5 py-3 font-bold disabled:opacity-50">{busy ? "Deleting…" : "Delete report"}</button></div>
    </>}
  </div>;
}
export default function DeleteArticle() { return <EditorialGate><DeleteReport /></EditorialGate>; }
