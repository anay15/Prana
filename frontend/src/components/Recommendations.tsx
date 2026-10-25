import { ArrowRight, Clock, Sparkles, Target, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { usePoses } from "../hooks/usePoses";
import { api } from "../lib/api";
import type { Recommendation } from "../lib/types";
import { PoseFigure } from "./PoseFigure";

const ICONS = { new: Sparkles, weak_joint: Target, stale: Clock, improve: TrendingUp } as const;

/** "Up next for you": personalised pose picks with the reason for each. */
export function Recommendations({ title = "Up next for you", compact = false }: { title?: string; compact?: boolean }) {
  const { poses } = usePoses();
  const [recs, setRecs] = useState<Recommendation[] | null>(null);

  useEffect(() => {
    api.recommendations().then(setRecs).catch(() => setRecs([]));
  }, []);

  const poseById = new Map(poses?.map((p) => [p.id, p]));
  if (recs?.length === 0) return null;

  return (
    <section aria-labelledby="recs-title">
      <h2 id="recs-title" className={compact ? "font-semibold" : "font-display text-2xl font-semibold tracking-tight"}>{title}</h2>
      <ul className={`mt-4 grid gap-3 ${compact ? "" : "md:grid-cols-3"}`}>
        {(recs ?? Array.from({ length: 3 }, () => null)).map((rec, i) => {
          if (!rec) return <li key={i} className={`card animate-pulse bg-surface-2 ${compact ? "h-20" : "h-28"}`} />;
          const pose = poseById.get(rec.pose_id);
          const Icon = ICONS[rec.kind];
          return (
            <li key={rec.pose_id}>
              <Link
                to={`/practice/${rec.pose_id}`}
                className={`card group flex h-full items-center gap-4 transition hover:-translate-y-0.5 hover:shadow-lg ${compact ? "p-3" : "p-4"}`}
              >
                <div className={`shrink-0 rounded-2xl bg-surface-2 p-2 text-brand ${compact ? "h-12 w-12" : "h-16 w-16"}`}>
                  {pose && <PoseFigure pose={pose} className="h-full w-full" strokeWidth={5.5} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-accent">
                    <Icon className="h-3.5 w-3.5" aria-hidden /> {pose?.name ?? rec.pose_id}
                  </div>
                  <p className="mt-1 text-sm leading-snug">{rec.reason}</p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-brand" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
