import { useEffect, useState } from "react";
import { editorialRequest } from "../lib/editorialApi";

export interface QueuedAnalysis { id: string; status: string }
export default function AnalysisJobStatus({ initial, onReload }: { initial: QueuedAnalysis; onReload: () => Promise<void> }) {
  const [job, setJob] = useState<QueuedAnalysis & { lastError?: string }>(initial);
  const [error, setError] = useState("");
  const [reloading, setReloading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const result = await editorialRequest<{ data: QueuedAnalysis & { lastError?: string } }>(`/api/admin/jobs/${encodeURIComponent(initial.id)}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setJob(result.data); setError("");
        if (["queued", "running"].includes(result.data.status)) timer = setTimeout(poll, 3000);
      } catch (err) {
        if (!controller.signal.aborted) { setError(err instanceof Error ? err.message : "Unable to read analysis status."); timer = setTimeout(poll, 10000); }
      }
    };
    void poll();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [initial.id]);
  return <section aria-label="Summary generation status" className="border border-border p-5 space-y-3 text-sm">
    <p role="status">{job.status === "succeeded" ? "The DGX summary is ready for review." : job.status === "failed" ? "Summary generation failed. The source draft is unchanged." : job.status === "superseded" ? "The draft changed before generation finished. Its edits were preserved." : job.status === "running" ? "The DGX is generating this draft’s summary." : "Summary queued for the DGX."}</p>
    {job.lastError && <p>{job.lastError}</p>}
    {error && <p role="alert">{error}</p>}
    {job.status === "succeeded" && <><p>Reloading replaces any unsaved edits in this form.</p><button type="button" disabled={reloading} className="underline font-bold" onClick={async () => { setReloading(true); try { await onReload(); } catch (err) { setError(err instanceof Error ? err.message : "Unable to reload draft."); setReloading(false); } }}>{reloading ? "Loading draft…" : "Load generated draft for review"}</button></>}
  </section>;
}
