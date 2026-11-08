import { Link } from "react-router-dom";
import { ArrowUpRight, ChevronUp } from "lucide-react";
import { NEWS_DESKS } from "../lib/frontPageSelection";

const newsroom = [
  { label: "Latest reports", path: "/latest" },
  { label: "Breaking news desk", path: "/live" },
  { label: "Analysis & context", path: "/analysis" },
  { label: "Official source wire", path: "/wire" },
  { label: "Archives & search", path: "/archives" },
];
const publication = [
  { label: "About The Atlas Times", path: "/about" },
  { label: "Sources & AI policy", path: "/editorial-policy" },
  { label: "Source directory", path: "/sources" },
  { label: "All editorial desks", path: "/topics" },
];
const reader = [
  { label: "Saved stories", path: "/briefcase" },
  { label: "Reading preferences", path: "/preferences" },
  { label: "Editorial workspace", path: "/editorial" },
];

function FooterNav({ title, items }: { title: string; items: { label: string; path: string }[] }) {
  return (
    <nav aria-label={title} className="min-w-0">
      <h3 className="mb-5 text-xs font-bold uppercase tracking-[0.2em] text-zinc-300">{title}</h3>
      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <Link key={item.path} to={item.path} className="w-fit text-sm text-zinc-400 transition-colors hover:text-white hover:underline hover:underline-offset-4">
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export default function NewsroomFooter() {
  const sections = NEWS_DESKS.map((desk) => ({ label: desk.title, path: "/category/" + desk.slug }));
  return (
    <footer className="border-t border-zinc-700 bg-[#111317] text-zinc-100 print:hidden">
      <div className="px-5 pb-10 pt-12 sm:px-8 sm:pt-16 lg:px-[3%]">
        <div className="flex flex-col justify-between gap-8 border-b border-white/15 pb-10 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <Link to="/" className="font-old-english text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              The Atlas Times
            </Link>
            <p className="mt-5 max-w-lg text-sm leading-relaxed text-zinc-400">
              Global reporting. Original sources. Clearer context. A digital publication using labeled AI assistance and source-attributed coverage.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span className="border border-zinc-600 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-zinc-300">Global edition</span>
            <Link to="/sources" className="inline-flex items-center gap-2 text-sm font-bold text-white hover:underline hover:underline-offset-4">
              Explore sources <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-7 gap-y-12 py-12 sm:grid-cols-3 lg:grid-cols-[1.25fr_1.25fr_1fr_1fr_0.95fr] lg:py-14">
          <FooterNav title="The newsroom" items={newsroom} />
          <FooterNav title="News sections" items={sections.slice(0, 5)} />
          <FooterNav title="More sections" items={sections.slice(5)} />
          <FooterNav title="Publication" items={publication} />
          <FooterNav title="For readers" items={reader} />
        </div>

        <div className="flex flex-col justify-between gap-6 border-t border-white/15 pt-7 text-xs leading-relaxed text-zinc-400 md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} The Atlas Times. All rights reserved. Original reporting remains the property of its publishers.</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link to="/editorial-policy" className="hover:text-white">Corrections & attribution</Link>
            <Link to="/about" className="hover:text-white">About this publication</Link>
            <a href="#page-top" className="inline-flex items-center gap-1 font-bold text-white hover:underline">
              Back to top <ChevronUp aria-hidden="true" className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
