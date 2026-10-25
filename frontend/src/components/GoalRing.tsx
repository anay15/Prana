import type { WeeklyGoal } from "../lib/types";

/** Weekly goal: one segment per goal day, filled as days are practised. */
export function GoalRing({ goal, size = 96 }: { goal: WeeklyGoal; size?: number }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const n = Math.max(1, goal.goal_days);
  const gap = n > 1 ? 6 : 0;
  const seg = c / n - gap;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="-rotate-90" role="img"
      aria-label={`${goal.days_done} of ${goal.goal_days} practice days this week`}>
      {Array.from({ length: n }, (_, i) => (
        <circle
          key={i} cx="50" cy="50" r={r} fill="none" strokeWidth="10" strokeLinecap="round"
          stroke={i < goal.days_done ? "var(--good)" : "var(--surface-2)"}
          strokeDasharray={`${Math.max(seg, 0.01)} ${c}`}
          strokeDashoffset={-(i * (c / n))}
        />
      ))}
    </svg>
  );
}
