export const scoreColor = (score: number) => (score >= 80 ? "var(--good)" : score >= 55 ? "var(--warn)" : "var(--bad)");

export function ScoreRing({ score, size = 120, label = "Alignment" }: { score: number | null; size?: number; label?: string }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const value = score ?? 0;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="-rotate-90" width={size} height={size} aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="9" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke={scoreColor(value)} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)}
          style={{ transition: "stroke-dashoffset 250ms ease, stroke 250ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-display text-3xl font-semibold tabular-nums" aria-live="polite">{score === null ? "–" : Math.round(value)}</div>
          <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
        </div>
      </div>
    </div>
  );
}
