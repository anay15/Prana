import { Check, Loader2, LogOut, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { displayName, initials, useAuth } from "../lib/auth";
import type { Level } from "../lib/types";

const LEVELS: { value: Level; label: string; hint: string }[] = [
  { value: "beginner", label: "Beginner", hint: "New to yoga or coming back" },
  { value: "intermediate", label: "Intermediate", hint: "Comfortable with the basics" },
  { value: "advanced", label: "Advanced", hint: "Regular, confident practice" },
];

export function Profile() {
  const { me, loading, updateProfile, signOut, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [level, setLevel] = useState<Level>("beginner");
  const [goal, setGoal] = useState(3);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me?.authenticated) return;
    setName(me.display_name ?? "");
    setLevel(me.experience_level);
    setGoal(me.weekly_goal_days);
  }, [me]);

  if (loading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-brand" aria-label="Loading" />
      </div>
    );
  }
  if (!me?.authenticated) return <Navigate to="/signin?next=/profile" replace />;

  const dirty = name !== (me.display_name ?? "") || level !== me.experience_level || goal !== me.weekly_goal_days;
  const edited = () => setState("idle");

  async function save() {
    setState("saving");
    setError(null);
    try {
      await updateProfile({ display_name: name.trim() || null, experience_level: level, weekly_goal_days: goal });
      setState("saved");
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  }

  async function remove() {
    if (!window.confirm("Delete your account and all of your practice history? This can't be undone.")) return;
    try {
      await deleteAccount();
      navigate("/", { replace: true });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 md:py-14">
      <div className="flex items-center gap-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand text-lg font-semibold text-bg">{initials(me)}</div>
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-semibold sm:text-3xl">{displayName(me)}</h1>
          <p className="truncate text-sm text-muted">
            {me.email} · {me.has_google ? "Google" : "Email"} account
          </p>
        </div>
      </div>

      <section className="card mt-8 space-y-6 p-5 sm:p-6">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Display name</span>
          <input className="input" value={name} maxLength={60} onChange={(e) => { setName(e.target.value); edited(); }} />
        </label>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Experience</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {LEVELS.map((l) => (
              <label
                key={l.value}
                className={`cursor-pointer rounded-2xl border p-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${level === l.value ? "border-brand bg-brand-soft" : "border-line hover:bg-surface-2"}`}
              >
                <input
                  type="radio" name="level" value={l.value} checked={level === l.value} className="sr-only"
                  onChange={() => { setLevel(l.value); edited(); }}
                />
                <span className="block text-sm font-semibold">{l.label}</span>
                <span className="block text-xs text-muted">{l.hint}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">Used to pick poses that suit you in your recommendations.</p>
        </fieldset>

        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="goal" className="text-sm font-medium">Weekly goal</label>
            <span className="text-sm font-semibold tabular-nums text-brand">
              {goal} {goal === 1 ? "day" : "days"} a week
            </span>
          </div>
          <input
            id="goal" type="range" min={1} max={7} value={goal} className="mt-3 w-full accent-[var(--brand)]"
            onChange={(e) => { setGoal(Number(e.target.value)); edited(); }}
          />
        </div>

        {error && <p className="rounded-2xl bg-bad/10 px-4 py-3 text-sm text-bad" role="alert">{error}</p>}

        <div className="flex items-center gap-3">
          <button onClick={save} disabled={!dirty || state === "saving"} className="btn btn-primary">
            {state === "saving" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Save changes
          </button>
          {state === "saved" && !dirty && (
            <span className="inline-flex items-center gap-1 text-sm text-good">
              <Check className="h-4 w-4" aria-hidden /> Saved
            </span>
          )}
        </div>
      </section>

      <section className="card mt-5 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <button onClick={() => void signOut().then(() => navigate("/"))} className="btn btn-ghost">
          <LogOut className="h-4 w-4" aria-hidden /> Sign out
        </button>
        <button onClick={remove} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-bad">
          <Trash2 className="h-4 w-4" aria-hidden /> Delete account
        </button>
      </section>
    </div>
  );
}
