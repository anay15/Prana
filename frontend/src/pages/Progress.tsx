import { Flame, Timer, Trash2, Trophy, Waves } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PoseFigure } from "../components/PoseFigure";
import { scoreColor } from "../components/ScoreRing";
import { usePoses } from "../hooks/usePoses";
import { api } from "../lib/api";
import type { SessionRecord, Stats } from "../lib/types";

export function Progress() {
  const { poses } = usePoses();
  const [stats, setStats] = useState<Stats | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    Promise.all([api.stats(), api.sessions(20)])
      .then(([s, r]) => { setStats(s); setSessions(r); })
      .catch((e: Error) => setError(e.message));

  useEffect(() => { void load(); }, []);

  async function forget() {
    if (!window.confirm("Delete all of your saved sessions? This can't be undone.")) return;
    try {
      await api.deleteMyData();
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const poseById = new Map(poses?.map((p) => [p.id, p]));
  const maxDaily = Math.max(5, ...(stats?.daily.map((d) => d.minutes) ?? [0]));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-14">
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Your progress</h1>
      <p className="mt-2 text-muted">Saved anonymously on this browser. No account needed.</p>

      {error && <p className="card mt-6 p-5 text-bad" role="alert">{error}</p>}

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={Waves} label="Sessions" value={stats?.total_sessions} />
        <Tile icon={Timer} label="Minutes practised" value={stats?.total_minutes} />
        <Tile icon={Trophy} label="Minutes held in form" value={stats?.total_hold_minutes} />
        <Tile icon={Flame} label="Day streak" value={stats?.current_streak_days} accent />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <section className="card p-5 sm:p-6">
          <h2 className="font-semibold">Last 14 days</h2>
          <div className="mt-6 flex h-44 items-end gap-1.5 sm:gap-2" role="img" aria-label="Minutes practised per day over the last 14 days">
            {stats?.daily.map((d) => {
              const date = new Date(`${d.date}T00:00:00`);
              return (
                <div key={d.date} className="group flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <div className="relative flex w-full flex-1 items-end">
                    <div
                      className={`w-full rounded-t-lg transition-all ${d.minutes ? "bg-brand group-hover:bg-brand-strong" : "bg-surface-2"}`}
                      style={{ height: `${Math.max(4, (d.minutes / maxDaily) * 100)}%` }}
                      title={`${d.minutes} min`}
                    />
                  </div>
                  <span className="text-[10px] text-muted">{date.toLocaleDateString(undefined, { weekday: "narrow" })}</span>
                </div>
              );
            }) ?? <div className="h-full w-full animate-pulse rounded-xl bg-surface-2" />}
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="font-semibold">Best scores</h2>
          {stats && stats.per_pose.length === 0 && (
            <p className="mt-4 text-sm text-muted">
              No sessions yet. <Link to="/poses" className="font-semibold text-brand hover:underline">Start your first pose</Link>.
            </p>
          )}
          <ul className="mt-4 space-y-3">
            {stats?.per_pose.map((p) => {
              const pose = poseById.get(p.pose_id);
              return (
                <li key={p.pose_id} className="flex items-center gap-3">
                  <div className="h-10 w-10 shrink-0 rounded-xl bg-surface-2 p-1 text-brand">{pose && <PoseFigure pose={pose} className="h-full w-full" strokeWidth={6} />}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between text-sm">
                      <span className="truncate font-medium">{pose?.name ?? p.pose_id}</span>
                      <span className="tabular-nums text-muted">{Math.round(p.best_score)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full" style={{ width: `${p.best_score}%`, background: scoreColor(p.best_score) }} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className="card mt-5 overflow-hidden">
        <div className="flex items-center justify-between p-5 sm:p-6">
          <h2 className="font-semibold">Recent sessions</h2>
          {!!sessions?.length && (
            <button onClick={forget} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-bad">
              <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete my data
            </button>
          )}
        </div>
        {sessions?.length === 0 && <p className="px-6 pb-6 text-sm text-muted">Your completed sessions will show up here.</p>}
        <ul className="divide-y divide-line">
          {sessions?.map((s) => (
            <li key={s.id} className="flex items-center gap-4 px-5 py-3 sm:px-6">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{poseById.get(s.pose_id)?.name ?? s.pose_id}</div>
                <div className="text-xs text-muted">
                  {new Date(s.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} · {Math.round(s.duration_s)}s
                </div>
              </div>
              <div className="text-right">
                <div className="font-display text-lg font-semibold tabular-nums" style={{ color: scoreColor(s.avg_score) }}>{Math.round(s.avg_score)}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted">avg</div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Tile({ icon: Icon, label, value, accent }: { icon: typeof Flame; label: string; value?: number; accent?: boolean }) {
  return (
    <div className="card p-4 sm:p-5">
      <Icon className={`h-5 w-5 ${accent ? "text-accent" : "text-brand"}`} aria-hidden />
      <div className="mt-3 font-display text-3xl font-semibold tabular-nums">{value ?? "–"}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
