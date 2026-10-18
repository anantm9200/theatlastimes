import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { Article } from "../types";
import { editorialRequest } from "../lib/editorialApi";
import { articlePath } from "../lib/seo";
import type { QueuedAnalysis } from "./AnalysisJobStatus";

const categories = ["World", "Business", "Economy", "Finance", "Politics", "Technology", "AI", "Geopolitics", "Tech Policy", "Security", "Climate", "Environment", "Science", "Sports"];
const regions = ["Global", "North America", "Europe", "Asia", "Middle East", "Africa", "Latin America"];
const control = "block w-full border border-border bg-background p-3 mt-2 focus:border-foreground";

type Action = "draft" | "published" | "archived" | "analyze";
export default function ArticleForm({ initial, onSaved }: { initial?: Article; onSaved: (article: Article, message: string, job?: QueuedAnalysis) => void }) {
  const [fields, setFields] = useState({ title: initial?.title || "", summary: initial?.aiSummary || "", sourceName: initial?.sourceName || "The Atlas Times", originalUrl: initial?.originalUrl || "", authorName: initial?.authorName || "", category: initial?.category || "World", region: initial?.region || "Global", language: initial?.language || "en", imageUrl: initial?.imageUrl || "", imageCredit: initial?.imageCredit || "", imageLicense: initial?.imageLicense || "", imageCaption: initial?.imageCaption || "", sourcePublishedAt: initial?.sourcePublishedAt || "", tags: (initial?.tags || []).join(", "), reviewNote: "", keyPoints: (initial?.keyPoints || []).join("\n"), whyItMatters: initial?.whyItMatters || "", detailedHumanizedSummary: initial?.detailedHumanizedSummary || "" });
  const [aiGenerated, setAiGenerated] = useState(initial?.aiGenerated || false);
  const [body, setBody] = useState(initial?.fullContent || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] } })],
    content: body,
    onUpdate: ({ editor }) => setBody(editor.getHTML()),
    editorProps: { attributes: { role: "textbox", "aria-label": "Report body", "aria-multiline": "true", class: "article-content min-h-[280px] border border-border p-4 focus:outline focus:outline-2 focus:outline-foreground" } },
  });
  const update = (field: keyof typeof fields, value: string) => setFields(current => ({ ...current, [field]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const action = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value as Action || "draft";
    setError("");
    if (action === "published") {
      if (!fields.authorName.trim() || fields.reviewNote.trim().length < 10) { setError("Publishing requires an author and a new review note of at least 10 characters."); return; }
      if (!fields.summary.trim() || !body.replace(/<[^>]+>/g, "").trim()) { setError("Add a summary and report body before publishing."); return; }
      if (fields.imageUrl && (!fields.imageCredit.trim() || !fields.imageLicense.trim())) { setError("Add the image credit and license or remove the image before publishing."); return; }
    }
    setBusy(true);
    try {
      const payload = { ...fields, expectedModifiedAt: initial?.modifiedAt, fullContent: body, summary: fields.summary, sourcePublishedAt: fields.sourcePublishedAt.trim() || undefined, tags: fields.tags.split(",").map(tag => tag.trim()).filter(Boolean), keyPoints: fields.keyPoints.split("\n").map(point => point.trim()).filter(Boolean), aiGenerated, status: action === "analyze" ? "draft" : action };
      const saved = await editorialRequest<{ data: Article }>(initial ? `/api/news/${encodeURIComponent(initial.id)}` : "/api/news", { method: initial ? "PUT" : "POST", body: JSON.stringify(payload) });
      if (action === "analyze") {
        try {
          const analyzed = await editorialRequest<{ data: Article; job?: { id: string; status: string } }>(`/api/news/${encodeURIComponent(saved.data.id)}/analyze`, { method: "POST" });
          onSaved(analyzed.data, analyzed.job ? "Analysis queued. Publication still requires editorial review." : "Summary generated. Review every claim and source before publishing.", analyzed.job);
        } catch (err) {
          onSaved(saved.data, `Draft saved. ${err instanceof Error ? err.message : "Summary generation failed."}`);
        }
      } else {
        onSaved(saved.data, action === "published" ? "Report published." : action === "archived" ? "Report archived and removed from the public feed." : "Draft saved. It is not public.");
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save the report."); }
    finally { setBusy(false); }
  };

  const field = (name: keyof typeof fields, label: string, options: { type?: string; max?: number; required?: boolean; readOnly?: boolean; placeholder?: string } = {}) => <label className="block text-sm font-bold">{label}<input className={control} type={options.type || "text"} maxLength={options.max} required={options.required} readOnly={options.readOnly} placeholder={options.placeholder} value={fields[name]} onChange={event => update(name, event.target.value)} /></label>;

  return <form onSubmit={submit} className="space-y-7">
    <fieldset disabled={busy} className="space-y-7 disabled:opacity-70">
      {field("title", "Headline", { required: true, max: 300 })}
      <div className="grid sm:grid-cols-2 gap-6">
        {field("sourceName", "Source or publication name", { required: true, max: 160 })}
        {field("originalUrl", initial ? "Original source URL (fixed after creation)" : "Original source URL (leave empty for original reporting)", { type: "url", max: 2048, readOnly: !!initial })}
        {field("authorName", "Accountable author", { max: 160 })}
        {field("sourcePublishedAt", "Source publication time (optional)", { placeholder: "2026-10-17T10:00:00Z", max: 80 })}
      </div>
      <div className="grid sm:grid-cols-3 gap-6">
        <label className="block text-sm font-bold">Category<select value={fields.category} onChange={event => update("category", event.target.value)} className={control}>{[...new Set([...categories, fields.category])].map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="block text-sm font-bold">Region<select value={fields.region} onChange={event => update("region", event.target.value)} className={control}>{[...new Set([...regions, fields.region])].map(value => <option key={value}>{value}</option>)}</select></label>
        {field("language", "Language code", { max: 20, required: true })}
      </div>
      {field("tags", "Tags (separate with commas)")}
      <label className="block text-sm font-bold">Summary<textarea className={control} maxLength={5000} rows={4} value={fields.summary} onChange={event => update("summary", event.target.value)} /></label>
      <label className="flex items-start gap-3"><input type="checkbox" checked={aiGenerated} onChange={event => setAiGenerated(event.target.checked)} className="mt-1" />This report includes AI-assisted text.</label>
      <div>
        <p className="text-sm font-bold mb-2">Report body</p>
        {editor && <div role="toolbar" aria-label="Text formatting" className="flex flex-wrap border border-border border-b-0">
          <button type="button" aria-pressed={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} className="px-3 py-2 font-bold">Bold</button>
          <button type="button" aria-pressed={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} className="px-3 py-2 italic">Italic</button>
          <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className="px-3 py-2">Heading</button>
          <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className="px-3 py-2">Bullet list</button>
          <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className="px-3 py-2">Numbered list</button>
        </div>}
        <EditorContent editor={editor} />
      </div>
      <details className="border border-border p-4 space-y-5">
        <summary className="font-bold cursor-pointer">Summary details and context</summary>
        <label className="block text-sm font-bold">Expanded summary<textarea className={control} maxLength={15000} rows={5} value={fields.detailedHumanizedSummary} onChange={event => update("detailedHumanizedSummary", event.target.value)} /></label>
        <label className="block text-sm font-bold">Key points (one per line)<textarea className={control} rows={4} value={fields.keyPoints} onChange={event => update("keyPoints", event.target.value)} /></label>
        <label className="block text-sm font-bold">Context<textarea className={control} maxLength={5000} rows={4} value={fields.whyItMatters} onChange={event => update("whyItMatters", event.target.value)} /></label>
      </details>
      <fieldset className="border border-border p-4 space-y-5">
        <legend className="font-bold px-2">Cover image (optional)</legend>
        {field("imageUrl", "Image URL", { type: "url", max: 2048 })}
        <div className="grid sm:grid-cols-2 gap-5">{field("imageCredit", "Image credit", { max: 500 })}{field("imageLicense", "License and permitted use", { max: 1000 })}</div>
        {field("imageCaption", "Image caption", { max: 1000 })}
      </fieldset>
      <label className="block text-sm font-bold">Publication review note<textarea className={control} rows={3} maxLength={4000} value={fields.reviewNote} onChange={event => update("reviewNote", event.target.value)} placeholder="Confirm the facts, source attribution, and rights checked for this publication or update." /></label>
      <p className="text-sm text-muted-foreground">Publishing makes the report publicly accessible. Every publication and published update requires a fresh review note. Drafts remain private.</p>
      {error && <p role="alert" className="border border-red-600 p-4 text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-4 pt-5 border-t border-border">
        <button type="submit" value={initial?.status === "published" ? "published" : "draft"} className="bg-foreground text-background px-5 py-3 font-bold">{initial?.status === "published" ? "Update published report" : "Save draft"}</button>
        {initial?.status !== "published" && <button type="submit" value="analyze" className="border px-5 py-3 font-bold">Save draft and generate summary</button>}
        {initial?.status === "published" ? <button type="submit" value="draft" className="border px-5 py-3">Unpublish and save draft</button> : <button type="submit" value="published" className="border px-5 py-3 font-bold">Publish reviewed report</button>}
        {initial && <button type="submit" value="archived" className="border px-5 py-3">Archive</button>}
      </div>
      {initial?.status === "published" && <Link to={articlePath(initial)} className="inline-block underline">View public report</Link>}
    </fieldset>
    {busy && <p role="status">Saving report…</p>}
  </form>;
}
