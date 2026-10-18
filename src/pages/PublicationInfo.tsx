import { Link } from "react-router-dom";
import SeoHead from "../lib/SeoHead";

export default function PublicationInfo({ policy = false }: { policy?: boolean }) {
  const title = policy ? "Sources, AI and corrections" : "About The Atlas Times";
  return <article className="max-w-3xl mx-auto px-4 py-12 space-y-6 font-serif text-lg leading-relaxed">
    <SeoHead title={title} description={policy ? "How The Atlas Times attributes sources, labels AI-assisted summaries, and handles editorial review and corrections." : "The Atlas Times aggregates global news with source links and AI-assisted summaries."} />
    <h1 className="text-4xl font-bold">{title}</h1>
    {policy ? <>
      <h2 className="text-2xl font-bold">Sources and attribution</h2>
      <p>Aggregated reports link to their original publisher. Source publication dates describe the original reporting; publication and update dates describe the version shown here. A summary is not a substitute for the original report or evidence of independent verification.</p>
      <h2 className="text-2xl font-bold">AI-assisted summaries</h2>
      <p>AI can help summarize supplied source material and identify key points. Reports that use generated summaries are labeled. AI output can omit context or contain errors. Read the linked sources and compare reporting before relying on a claim.</p>
      <h2 className="text-2xl font-bold">Review and publication</h2>
      <p>Newly collected and generated reports enter a draft queue. Approved source briefs can publish automatically after the DGX checks source permissions, attribution, freshness, global relevance and source-grounded output. Failed checks leave a private draft for an editor. Automated checks do not imply human review. Publication review does not imply independent verification of every claim in an external source.</p>
      <h2 className="text-2xl font-bold">Images</h2>
      <p>Relevant freely licensed images are considered first. Publisher photos require recorded permission, retain photographer and agency credit, load directly from the publisher and link to the original report. A publisher setting can disable them. When a source image is unavailable, a labeled placeholder is used. A generic illustration should not be treated as evidence of an event.</p>
      <h2 className="text-2xl font-bold">Corrections</h2>
      <p>To report an error or a missing attribution, <a href="https://github.com/anantm9200/theatlastimes/issues" className="underline" rel="noopener noreferrer" target="_blank">open an issue in the publication’s public repository</a> with the article URL, the disputed claim, and supporting sources. Do not include private information. Corrections can update the report or remove it from publication.</p>
    </> : <>
      <p>The Atlas Times is a global news aggregation project covering politics, business, the economy, technology, and world affairs.</p>
      <p>Reports provide source links and may include AI-assisted summaries and context. The original publisher remains the reference for its reporting. <Link to="/editorial-policy" className="underline">Read how we use sources and AI</Link>.</p>
      <p>Explore the <Link to="/archives" className="underline">news archive</Link> or view the <a href="https://github.com/anantm9200/theatlastimes" className="underline" target="_blank" rel="noopener noreferrer">project repository</a>.</p>
    </>}
  </article>;
}
