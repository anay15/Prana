import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { GoogleButton } from "../components/GoogleButton";
import { Logo } from "../components/Logo";
import { useAuth } from "../lib/auth";

/** Only allow in-app redirects after sign-in (no open redirects). */
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/progress";
}

export function SignIn() {
  const { me, signIn, signUp, signInWithGoogle, googleClientId } = useAuth();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const mode = params.get("mode") === "signup" ? "signup" : "signin";
  const next = safeNext(params.get("next"));

  const [email, setEmail] = useState("");
  const [secret, setSecret] = useState("");
  const [name, setName] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (me?.authenticated) return <Navigate to={next} replace />;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      navigate(next, { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(() => (mode === "signup" ? signUp(email, secret, name) : signIn(email, secret)));
  };

  const switchMode = () => {
    setError(null);
    setParams(
      (p) => {
        p.set("mode", mode === "signup" ? "signin" : "signup");
        return p;
      },
      { replace: true },
    );
  };

  return (
    <div className="mx-auto grid max-w-md px-4 py-10 sm:py-16">
      <div className="card p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <Logo className="h-11 w-11" />
          <h1 className="mt-4 font-display text-2xl font-semibold">
            {mode === "signup" ? "Create your free account" : "Welcome back"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {mode === "signup"
              ? "Keep your progress on every device. Anything you've practised as a guest comes with you."
              : "Sign in to pick up where you left off."}
          </p>
        </div>

        {googleClientId && (
          <>
            <div className="mt-6">
              <GoogleButton
                clientId={googleClientId}
                text={mode === "signup" ? "signup_with" : "signin_with"}
                onCredential={(credential) => void run(() => signInWithGoogle(credential))}
              />
            </div>
            <div className="my-5 flex items-center gap-3 text-xs text-muted">
              <span className="h-px flex-1 bg-line" /> or with email <span className="h-px flex-1 bg-line" />
            </div>
          </>
        )}

        <form onSubmit={submit} className={`space-y-4 ${googleClientId ? "" : "mt-6"}`}>
          {mode === "signup" && (
            <Field label="Name (optional)">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="given-name" />
            </Field>
          )}
          <Field label="Email">
            <input
              className="input" type="email" required maxLength={254} autoComplete="email" inputMode="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password" hint={mode === "signup" ? "At least 10 characters." : undefined}>
            <div className="relative">
              <input
                className="input pr-11" type={reveal ? "text" : "password"} required
                minLength={mode === "signup" ? 10 : 1} maxLength={128}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={secret} onChange={(e) => setSecret(e.target.value)}
              />
              <button
                type="button" onClick={() => setReveal((s) => !s)}
                className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-ink"
                aria-label={reveal ? "Hide password" : "Show password"}
              >
                {reveal ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
              </button>
            </div>
          </Field>

          {error && <p className="rounded-2xl bg-bad/10 px-4 py-3 text-sm text-bad" role="alert">{error}</p>}

          <button type="submit" disabled={busy} className="btn btn-primary w-full">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          {mode === "signup" ? "Already have an account?" : "New to Prana?"}{" "}
          <button onClick={switchMode} className="font-semibold text-brand hover:underline">
            {mode === "signup" ? "Sign in" : "Create one"}
          </button>
        </p>
      </div>
      <p className="mt-4 text-center text-xs text-muted">
        Or <Link to="/poses" className="underline hover:text-ink">keep practising as a guest</Link>. Your camera video never leaves your device.
      </p>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
