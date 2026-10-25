import type { PoseHistory } from "../lib/types";

const W = 600;
const H = 220;
const PAD = { top: 12, right: 12, bottom: 28, left: 32 };

/** Average and best alignment score per session, oldest to newest. */
export function ScoreChart({ sessions }: { sessions: PoseHistory["sessions"] }) {
  const n = sessions.length;
  const x = (i: number) => PAD.left + (n === 1 ? (W - PAD.left - PAD.right) / 2 : (i / (n - 1)) * (W - PAD.left - PAD.right));
  const y = (v: number) => PAD.top + (1 - v / 100) * (H - PAD.top - PAD.bottom);
  const line = (key: "avg_score" | "best_score") => sessions.map((s, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(s[key]).toFixed(1)}`).join(" ");
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const first = sessions[0];
  const last = sessions[n - 1];
  const summary = `${n} sessions. Average score went from ${Math.round(first.avg_score)} to ${Math.round(last.avg_score)}.`;

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={summary}>
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
            <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{v}</text>
          </g>
        ))}
        <path d={line("best_score")} fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="5 5" strokeLinejoin="round" />
        <path d={line("avg_score")} fill="none" stroke="var(--brand)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {sessions.map((s, i) => (
          <circle key={i} cx={x(i)} cy={y(s.avg_score)} r="4" fill="var(--brand)" stroke="var(--surface)" strokeWidth="2">
            <title>{`${fmt(s.created_at)}: average ${Math.round(s.avg_score)}, best ${Math.round(s.best_score)}`}</title>
          </circle>
        ))}
        <text x={PAD.left} y={H - 6} fontSize="11" fill="var(--muted)">{fmt(first.created_at)}</text>
        {n > 1 && <text x={W - PAD.right} y={H - 6} fontSize="11" fill="var(--muted)" textAnchor="end">{fmt(last.created_at)}</text>}
      </svg>
      <figcaption className="mt-2 flex gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-brand" /> Average</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded border-t-2 border-dashed border-accent" /> Best</span>
      </figcaption>
    </figure>
  );
}
