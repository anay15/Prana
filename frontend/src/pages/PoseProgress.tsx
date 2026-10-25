import { ArrowLeft, Loader2, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PoseFigure } from "../components/PoseFigure";
import { ScoreChart } from "../components/ScoreChart";
import { scoreColor } from "../components/ScoreRing";
import { usePoses } from "../hooks/usePoses";
import { api } from "../lib/api";
import { jointLabel } from "../lib/geometry";
import type { PoseHistory } from "../lib/types";

export function PoseProgress() {
  const { poseId = "" } = useParams();
  const { poses } = usePoses();
  const pose = poses?.find((p) => p.id === poseId);
  const [history, setHistory] = useState<PoseHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.history(poseId).then(setHistory).catch((e: Error) => setError(e.message));
  }, [poseId]);

  if (error) return <p className="mx-auto max-w-md px-6 py-24 text-center text-muted">{error}</p>;
  if (!history || !poses) {
    return <div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin text-brand" aria-label="Loading" /></div>;
  }

  const n = history.sessions.length;
  const best = n ? Math.max(...history.sessions.map((s) => s.best_score)) : 0;
  const recentAvg = n ? history.sessions.slice(-3).reduce((a, s) => a + s.avg_score, 0) / Math.min(3, n) : 0;
  const weakest = history.joints[0];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 md:py-14">
      <Link to="/progress" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Progress
      </Link>

      <div className="mt-4 flex items-center gap-4">
        <div className="h-20 w-20 shrink-0 rounded-3xl bg-surface-2 p-2 text-brand">{pose && <PoseFigure pose={pose} className="h-full w-full" />}</div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">{pose?.name ?? poseId}</h1>
          <p className="text-sm italic text-muted">{pose?.sanskrit}</p>
        </div>
        <Link to={`/practice/${poseId}`} className="btn btn-primary shrink-0"><Play className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Practice</span></Link>
      </div>

      {n === 0 ? (
        <div className="card mt-8 p-8 text-center text-muted">
          You haven't practised this pose yet. <Link to={`/practice/${poseId}`} className="font-semibold text-brand hover:underline">Start now</Link>.
        </div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-3 gap-3">
            {[["Sessions", n], ["Best score", Math.round(best)], ["Recent average", Math.round(recentAvg)]].map(([label, value]) => (
              <div key={label} className="card p-4">
                <div className="font-display text-3xl font-semibold tabular-nums">{value}</div>
                <div className="text-xs text-muted">{label}</div>
              </div>
            ))}
          </div>

          <section className="card mt-5 p-5 sm:p-6">
            <h2 className="font-semibold">Score over time</h2>
            <div className="mt-4"><ScoreChart sessions={history.sessions} /></div>
          </section>

          <section className="card mt-5 p-5 sm:p-6">
            <h2 className="font-semibold">Joint alignment</h2>
            <p className="mt-1 text-sm text-muted">
              Average over your last few sessions.
              {weakest && weakest.score < 80 && <> Focus on your <strong className="font-semibold text-ink">{jointLabel(weakest.joint)}</strong>.</>}
            </p>
            <ul className="mt-4 space-y-3">
              {history.joints.map((j) => (
                <li key={j.joint}>
                  <div className="flex justify-between text-xs">
                    <span className="font-medium capitalize">{jointLabel(j.joint)}</span>
                    <span className="tabular-nums text-muted">{Math.round(j.score)}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full" style={{ width: `${j.score}%`, background: scoreColor(j.score) }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
