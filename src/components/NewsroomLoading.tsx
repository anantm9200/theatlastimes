import { Newspaper, ShieldCheck, Radio } from "lucide-react";

export default function NewsroomLoading({ compact = false }: { compact?: boolean }) {
  const shimmer = "animate-pulse motion-reduce:animate-none bg-zinc-200/75";
  return (
    <section
      role="status"
      aria-live="polite"
      aria-label="Loading source-attributed reports"
      className={"w-full py-8 sm:py-12 " + (compact ? "min-h-[360px]" : "min-h-[min(77vh,800px)]")}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-foreground/20 pb-6">
        <div className="flex items-center gap-3">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-zinc-950 text-white">
            <Newspaper aria-hidden="true" className="h-4 w-4" />
          </span>
          <span className="text-xs font-bold uppercase tracking-[0.24em] text-zinc-700">The Atlas Times / News Desk</span>
        </div>
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-zinc-600">
          <span className="relative h-2 w-2 rounded-full bg-red-700 animate-pulse motion-reduce:animate-none" aria-hidden="true" />
          Checking published reports
        </span>
      </div>

      <div className="py-8 sm:py-11">
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-red-700">
          <Radio aria-hidden="true" className="h-4 w-4" />
          Connecting to the newsroom
        </p>
        <h2 className="mt-3 max-w-3xl font-serif text-3xl font-bold leading-tight sm:text-5xl">
          Bringing you the latest reporting.
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600 sm:text-base">
          Gathering published stories, original-source links and editorial context. Headlines will appear here as soon as the news feed responds.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-7 border-t border-zinc-200 pt-7 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)] lg:gap-10" aria-hidden="true">
        <div>
          <div className={"h-48 w-full sm:h-64 lg:h-72 " + shimmer} />
          <div className={"mt-6 h-3 w-24 " + shimmer} />
          <div className={"mt-4 h-7 w-11/12 " + shimmer} />
          <div className={"mt-3 h-7 w-3/4 " + shimmer} />
          <div className={"mt-6 h-3 w-4/5 " + shimmer} />
          <div className={"mt-2 h-3 w-3/5 " + shimmer} />
        </div>
        <div className="lg:border-l lg:border-zinc-200 lg:pl-8">
          <div className="font-serif text-2xl font-bold">From the desks</div>
          {[0, 1, 2].map((item) => (
            <div className="border-b border-zinc-200 py-5" key={item}>
              <div className={"h-2.5 w-20 " + shimmer} />
              <div className={"mt-3 h-4 w-11/12 " + shimmer} />
              <div className={"mt-2 h-4 w-3/4 " + shimmer} />
            </div>
          ))}
        </div>
      </div>

      <p className="mt-8 flex items-center gap-2 text-xs leading-relaxed text-zinc-500">
        <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0" />
        We show source-attributed reporting; loading indicators are not live headlines.
      </p>
    </section>
  );
}
