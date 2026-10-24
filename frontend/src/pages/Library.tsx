import { ArrowRight, Camera } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { PoseFigure } from "../components/PoseFigure";
import { usePoses } from "../hooks/usePoses";

const FILTERS = ["all", "beginner", "intermediate"] as const;

export function Library() {
  const { poses, error, loading } = usePoses();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const shown = poses?.filter((p) => filter === "all" || p.level === filter) ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-14">
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Pose library</h1>
      <p className="mt-2 max-w-2xl text-muted">Each pose has reference joint angles that Prana compares against your body in real time.</p>

      <div className="mt-6 flex gap-2" role="tablist" aria-label="Filter by level">
        {FILTERS.map((f) => (
          <button
            key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-2 text-sm font-medium capitalize transition ${filter === f ? "bg-ink text-bg" : "bg-surface-2 text-muted hover:text-ink"}`}
          >
            {f}
          </button>
        ))}
      </div>

      {error && <p className="card mt-8 p-6 text-bad">Couldn't load poses. {error}</p>}
      {loading && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="card h-80 animate-pulse bg-surface-2" />)}
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((p) => (
          <article key={p.id} className="card group flex flex-col overflow-hidden transition hover:shadow-lg">
            <div className="relative bg-surface-2/60 p-6 text-brand">
              <PoseFigure pose={p} className="mx-auto h-40 w-40 transition group-hover:scale-105" />
              <span className="chip absolute left-4 top-4 !bg-surface capitalize">{p.level}</span>
              <span className="chip absolute right-4 top-4 !bg-surface gap-1">
                <Camera className="h-3 w-3" aria-hidden /> {p.view} view
              </span>
            </div>
            <div className="flex flex-1 flex-col p-5">
              <h2 className="font-display text-xl font-semibold">{p.name}</h2>
              <p className="text-sm italic text-muted">{p.sanskrit}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted">{p.description}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {p.focus.map((f) => <span key={f} className="chip">{f}</span>)}
              </div>
              <div className="mt-auto flex items-center justify-between pt-5">
                <span className="text-xs text-muted">Hold {p.hold_seconds}s</span>
                <Link to={`/practice/${p.id}`} className="btn btn-primary !py-2.5">
                  Practice <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
