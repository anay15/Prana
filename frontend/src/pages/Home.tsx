import { ArrowRight, AudioLines, LineChart, ScanLine, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PoseFigure } from "../components/PoseFigure";
import { Recommendations } from "../components/Recommendations";
import { usePoses } from "../hooks/usePoses";
import { displayName, useAuth } from "../lib/auth";

const FEATURES = [
  { icon: ScanLine, title: "3D pose tracking", body: "BlazePose GHUM tracks 33 body landmarks in 3D at up to 30+ fps, right in your browser." },
  { icon: AudioLines, title: "Spoken corrections", body: "A calm voice tells you exactly what to adjust, like “straighten your left leg”, while you hold the pose." },
  { icon: ShieldCheck, title: "Private by design", body: "The AI runs on your device. Your camera feed is never uploaded, recorded or stored." },
  { icon: LineChart, title: "Progress you can see", body: "Alignment scores, hold times and streaks are tracked so you can watch your practice grow." },
];

const STEPS = [
  { n: "01", title: "Pick a pose", body: "Choose from standing, balancing and resting asanas, from beginner to intermediate." },
  { n: "02", title: "Step into frame", body: "Prop up your phone or laptop so your whole body is visible. Prana finds you instantly." },
  { n: "03", title: "Flow with feedback", body: "Live joint-by-joint scoring and voice cues guide you into alignment. Hold it to complete." },
];

export function Home() {
  const { poses } = usePoses();
  const { me } = useAuth();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!poses?.length) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % poses.length), 2800);
    return () => window.clearInterval(t);
  }, [poses]);

  const featured = poses?.[i];

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-brand-soft blur-3xl animate-breathe" />
        <div className="pointer-events-none absolute -bottom-48 -left-32 h-96 w-96 rounded-full bg-accent/15 blur-3xl animate-breathe" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 md:grid-cols-[1.15fr_1fr] md:pb-24 md:pt-20">
          <div className="animate-fade-up">
            <span className="chip mb-5 !bg-brand-soft !text-brand-strong">On-device AI · No sign-up</span>
            <h1 className="font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Your personal yoga coach, <span className="text-brand">right in the browser.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              Prana watches your form through your camera, scores every joint in real time and talks you into
              alignment. It's like a teacher at your side, without the video ever leaving your device.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/poses" className="btn btn-primary">
                Start practising <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <a href="#how" className="btn btn-ghost">How it works</a>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 text-center sm:text-left">
              {[["33", "3D landmarks"], ["8", "guided asanas"], ["0", "frames uploaded"]].map(([v, l]) => (
                <div key={l}>
                  <dt className="sr-only">{l}</dt>
                  <dd className="font-display text-3xl font-semibold">{v}</dd>
                  <dd className="text-xs text-muted">{l}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative mx-auto w-full max-w-sm animate-fade-up [animation-delay:150ms]">
            <div className="card relative aspect-[4/5] overflow-hidden p-6 shadow-xl shadow-brand/5">
              <div className="absolute inset-x-0 top-0 flex items-center justify-between p-5">
                <span className="chip">{featured?.level ?? "beginner"}</span>
                <span className="flex items-center gap-1.5 text-xs font-medium text-good">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-good" /> Tracking
                </span>
              </div>
              <div className="grid h-full place-items-center text-brand">
                {featured && (
                  <PoseFigure key={featured.id} pose={featured} className="h-4/5 w-4/5 animate-fade-up" />
                )}
              </div>
              <div className="absolute inset-x-0 bottom-0 p-5">
                <div className="font-display text-xl font-semibold">{featured?.name ?? "Mountain Pose"}</div>
                <div className="text-sm text-muted">{featured?.sanskrit ?? "Tadasana"}</div>
              </div>
            </div>
            <div className="card absolute -left-4 top-1/3 hidden px-4 py-3 shadow-lg sm:block">
              <div className="text-[11px] uppercase tracking-wider text-muted">Alignment</div>
              <div className="font-display text-2xl font-semibold text-good">94</div>
            </div>
            <div className="card absolute -right-3 bottom-24 hidden max-w-[11rem] px-4 py-3 text-sm shadow-lg sm:block">
              “Lift your arms a little higher”
            </div>
          </div>
        </div>
      </section>

      {me?.authenticated && (
        <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
          <Recommendations title={`Up next for you, ${displayName(me)}`} />
        </div>
      )}

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-20">
        <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Built like a real teacher</h2>
        <p className="mt-3 max-w-2xl text-muted">Not a video to follow along with. Prana looks at <em>your</em> body and responds to it.</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card p-6">
              <div className="mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-brand-soft text-brand-strong">
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 bg-surface-2/60">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-20">
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">How it works</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="card p-6">
                <div className="font-display text-4xl font-semibold text-accent">{s.n}</div>
                <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Pose strip */}
      {poses && (
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-20">
          <div className="flex items-end justify-between gap-4">
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Start with a pose</h2>
            <Link to="/poses" className="shrink-0 text-sm font-semibold text-brand hover:underline">View all</Link>
          </div>
          <div className="-mx-4 mt-8 flex snap-x gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
            {poses.map((p) => (
              <Link key={p.id} to={`/practice/${p.id}`} className="card group w-44 shrink-0 snap-start p-4 transition hover:-translate-y-1 hover:shadow-lg">
                <div className="aspect-square text-brand transition group-hover:text-brand-strong">
                  <PoseFigure pose={p} className="h-full w-full" />
                </div>
                <div className="mt-3 text-sm font-semibold">{p.name}</div>
                <div className="text-xs text-muted">{p.sanskrit}</div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
