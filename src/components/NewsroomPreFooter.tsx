import { Link } from "react-router-dom";
import { ArrowUpRight, BookOpen, ShieldCheck, Newspaper } from "lucide-react";

const pillars = [
  { icon: BookOpen, number: "01", title: "Go to the source", copy: "Original reporting stays one click away." },
  { icon: Newspaper, number: "02", title: "Read the context", copy: "Understand what has been reported — and what hasn't." },
  { icon: ShieldCheck, number: "03", title: "See our standards", copy: "How we label AI assistance, sources and editorial review." },
];

export default function NewsroomPreFooter() {
  return (
    <section aria-labelledby="prefooter-heading" className="print:hidden border-t-[3px] border-zinc-950 bg-[#f4f3ef] text-zinc-950">
      <div className="grid gap-10 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-20 lg:px-[3%] lg:py-20">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.23em] text-red-700">More than a headline</p>
          <h2 id="prefooter-heading" className="mt-5 max-w-2xl font-serif text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            Understand the story.
            <span className="block italic text-zinc-600">Follow the evidence.</span>
          </h2>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-zinc-700">
            Explore global reporting with the source, publication date and context in plain view. No invented breaking alerts. No mystery behind a headline.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/latest" className="inline-flex items-center gap-2 bg-zinc-950 px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-red-700">
              Latest reports <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link to="/editorial-policy" className="inline-flex items-center gap-2 border border-zinc-950 px-6 py-3.5 text-sm font-bold transition-colors hover:bg-white">
              Editorial standards <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>
        <div className="divide-y divide-zinc-300 border-t border-b border-zinc-300">
          {pillars.map(({ icon: Icon, number, title, copy }) => (
            <div key={number} className="grid grid-cols-[auto_1fr] items-start gap-5 py-6 sm:gap-7">
              <div className="flex h-12 w-12 items-center justify-center border border-zinc-300 text-zinc-800">
                <Icon aria-hidden="true" className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold tracking-widest text-red-700">{number} / OUR APPROACH</p>
                <h3 className="mt-1 font-serif text-2xl font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{copy}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
