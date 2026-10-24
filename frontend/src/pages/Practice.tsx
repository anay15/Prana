import { ArrowLeft, Camera, CheckCircle2, Cpu, Loader2, RotateCcw, Square, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PoseFigure } from "../components/PoseFigure";
import { ScoreRing, scoreColor } from "../components/ScoreRing";
import { usePoses } from "../hooks/usePoses";
import { api } from "../lib/api";
import {
  coachingCue,
  evaluatePose,
  type Evaluation,
  JOINT_LANDMARKS,
  jointLabel,
  measureAngles,
  SKELETON,
  smoothAngles,
} from "../lib/geometry";
import { defaultVariant, type LoadedEngine, loadPoseEngine, type ModelVariant } from "../lib/pose-engine";
import type { JointName, Pose } from "../lib/types";
import { VoiceCoach } from "../lib/voice";

type Phase = "intro" | "loading" | "live" | "done" | "error";

const MIN_COVERAGE = 0.7;
const HOLD_THRESHOLD = 75;
const UI_INTERVAL_MS = 120;

interface LiveView {
  score: number | null;
  cue: string;
  holdS: number;
  elapsedS: number;
  joints: Evaluation["joints"];
  fps: number;
  holding: boolean;
}

interface Summary {
  durationS: number;
  holdS: number;
  avgScore: number;
  bestScore: number;
  jointScores: Partial<Record<JointName, number>>;
  completed: boolean;
}

type SaveState = "idle" | "saving" | "saved" | "skipped" | "error";

const engines = new Map<ModelVariant, Promise<LoadedEngine>>();
function getEngine(variant: ModelVariant) {
  let p = engines.get(variant);
  if (!p) {
    p = loadPoseEngine(variant);
    p.catch(() => engines.delete(variant));
    engines.set(variant, p);
  }
  return p;
}

const EMPTY_LIVE: LiveView = { score: null, cue: "Step into the frame", holdS: 0, elapsedS: 0, joints: [], fps: 0, holding: false };

export function Practice() {
  const { poseId } = useParams();
  const { poses, error: posesError } = usePoses();
  const pose = poses?.find((p) => p.id === poseId);

  if (posesError) return <Centered>Couldn't load the pose library. {posesError}</Centered>;
  if (!poses) return <Centered><Loader2 className="h-6 w-6 animate-spin text-brand" aria-label="Loading" /></Centered>;
  if (!pose) return <Centered>That pose doesn't exist. <Link className="text-brand underline" to="/poses">Browse poses</Link></Centered>;
  return <PracticeSession key={pose.id} pose={pose} poses={poses} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto grid max-w-md place-items-center gap-2 px-6 py-24 text-center text-muted">{children}</div>;
}

function PracticeSession({ pose, poses }: { pose: Pose; poses: Pose[] }) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("intro");
  const [variant, setVariant] = useState<ModelVariant>(defaultVariant);
  const [voiceOn, setVoiceOn] = useState(true);
  const [live, setLive] = useState<LiveView>(EMPTY_LIVE);
  const [engineInfo, setEngineInfo] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const voiceRef = useRef(new VoiceCoach());
  const finishRef = useRef<(completed: boolean) => void>(() => {});

  const nextPose = poses[(poses.indexOf(pose) + 1) % poses.length];

  useEffect(() => {
    voiceRef.current.enabled = voiceOn;
    if (!voiceOn) voiceRef.current.stop();
  }, [voiceOn]);

  const stopHardware = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
    voiceRef.current.stop();
  }, []);

  useEffect(() => stopHardware, [stopHardware]);

  async function start() {
    setPhase("loading");
    setErrorMsg("");
    setSummary(null);
    setSaveState("idle");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new DOMException("Camera API unavailable", "NotSupportedError");
      const [stream, engine] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        }),
        getEngine(variant),
      ]);
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      wakeLockRef.current = (await navigator.wakeLock?.request("screen").catch(() => null)) ?? null;
      setEngineInfo(`${engine.variant === "heavy" ? "Heavy" : "Full"} model · ${engine.delegate}`);
      setPhase("live");
      voiceRef.current.say(`Let's begin ${pose.name}. Step into the frame.`, { force: true });
      runLoop(engine);
    } catch (err) {
      stopHardware();
      const name = err instanceof DOMException ? err.name : "";
      setErrorMsg(
        name === "NotAllowedError"
          ? "Camera access was blocked. Allow camera permission in your browser settings and try again."
          : name === "NotFoundError" || name === "OverconstrainedError"
            ? "No camera was found on this device."
            : name === "NotSupportedError"
              ? "Your browser doesn't support camera access. Try a recent Chrome, Edge, Safari or Firefox over HTTPS."
              : "We couldn't start the AI model on this device. Try switching off high accuracy mode.",
      );
      console.error(err);
      setPhase("error");
    }
  }

  function runLoop({ landmarker }: LoadedEngine) {
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    let lastVideoTime = -1;
    let lastFrameAt = performance.now();
    let lastUiAt = 0;
    let angles: Partial<Record<JointName, number>> = {};
    let smoothed = 0;
    let fps = 0;
    let wasHolding = false;
    let lastEval: Evaluation | null = null;
    let cue = "Step into the frame";
    const stats = {
      startedAt: 0,
      lastSeenAt: 0,
      holdS: 0,
      scoreSum: 0,
      scoreFrames: 0,
      best: 0,
      jointSums: {} as Partial<Record<JointName, { sum: number; n: number }>>,
    };

    const finish = (completed: boolean) => {
      stopHardware();
      const durationS = stats.startedAt ? (stats.lastSeenAt - stats.startedAt) / 1000 : 0;
      const avgScore = stats.scoreFrames ? stats.scoreSum / stats.scoreFrames : 0;
      const jointScores: Partial<Record<JointName, number>> = {};
      for (const [j, v] of Object.entries(stats.jointSums) as [JointName, { sum: number; n: number }][]) {
        jointScores[j] = v.sum / v.n;
      }
      const result: Summary = {
        durationS,
        holdS: Math.min(stats.holdS, durationS),
        avgScore,
        bestScore: Math.max(stats.best, avgScore),
        jointScores,
        completed,
      };
      setSummary(result);
      setPhase("done");
      if (completed) voiceRef.current.say("Beautiful. Pose complete.", { force: true });
      void save(result);
    };
    finishRef.current = finish;

    const frame = () => {
      rafRef.current = requestAnimationFrame(frame);
      if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
      lastVideoTime = video.currentTime;

      const now = performance.now();
      const dt = (now - lastFrameAt) / 1000;
      lastFrameAt = now;
      fps = fps ? fps * 0.9 + (1 / Math.max(dt, 1e-3)) * 0.1 : 1 / Math.max(dt, 1e-3);

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const result = landmarker.detectForVideo(video, now);
      const image = result.landmarks[0];
      const world = result.worldLandmarks[0];

      if (image && world) {
        angles = smoothAngles(angles, measureAngles(world, image));
        const ev = evaluatePose(angles, pose);
        lastEval = ev;
        const visible = ev.coverage >= MIN_COVERAGE;

        if (visible) {
          if (!stats.startedAt) stats.startedAt = now;
          stats.lastSeenAt = now;
          smoothed = smoothed ? smoothed * 0.85 + ev.score * 0.15 : ev.score;
          stats.scoreSum += ev.score;
          stats.scoreFrames += 1;
          stats.best = Math.max(stats.best, smoothed);
          for (const j of ev.joints) {
            const acc = (stats.jointSums[j.joint] ??= { sum: 0, n: 0 });
            acc.sum += j.score;
            acc.n += 1;
          }
        }

        const holding = visible && smoothed >= HOLD_THRESHOLD;
        if (holding) stats.holdS += Math.min(dt, 0.25);
        if (holding && !wasHolding) voiceRef.current.say("Great. Hold it there.", { force: true });
        wasHolding = holding;

        if (!visible) {
          cue = pose.view === "side" ? "Turn sideways and step back so your whole body is in view" : "Step back so your whole body is in view";
          voiceRef.current.say("Step back so I can see your whole body");
        } else if (holding) {
          cue = "Hold it… breathe steadily";
        } else {
          const c = coachingCue(ev);
          cue = c?.text ?? "Almost there, settle into the pose";
          if (c) voiceRef.current.say(c.text);
        }

        drawSkeleton(ctx, image, ev);

        if (stats.holdS >= pose.hold_seconds) {
          finish(true);
          return;
        }
      } else {
        cue = "Step into the frame";
        wasHolding = false;
      }

      if (now - lastUiAt > UI_INTERVAL_MS) {
        lastUiAt = now;
        const visible = !!lastEval && lastEval.coverage >= MIN_COVERAGE && !!image;
        setLive({
          score: visible ? smoothed : null,
          cue,
          holdS: stats.holdS,
          elapsedS: stats.startedAt ? (now - stats.startedAt) / 1000 : 0,
          joints: visible && lastEval ? lastEval.joints : [],
          fps,
          holding: wasHolding,
        });
      }
    };
    rafRef.current = requestAnimationFrame(frame);
  }

  async function save(s: Summary) {
    if (s.durationS < 3 || s.avgScore <= 0) {
      setSaveState("skipped");
      return;
    }
    setSaveState("saving");
    try {
      const duration = Math.min(Math.round(s.durationS * 10) / 10, 3600);
      await api.saveSession({
        pose_id: pose.id,
        duration_s: duration,
        hold_s: Math.min(Math.round(s.holdS * 10) / 10, duration),
        avg_score: Math.round(s.avgScore * 10) / 10,
        best_score: Math.round(Math.max(s.bestScore, s.avgScore) * 10) / 10,
        joint_scores: Object.fromEntries(Object.entries(s.jointScores).map(([k, v]) => [k, Math.round((v ?? 0) * 10) / 10])),
      });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  const holdPct = Math.min(100, (live.holdS / pose.hold_seconds) * 100);
  const showCamera = phase === "loading" || phase === "live";

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 md:py-10">
      <div className="mb-5 flex items-center justify-between gap-3">
        <Link to="/poses" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden /> All poses
        </Link>
        {phase === "live" && <span className="chip gap-1.5"><Cpu className="h-3 w-3" aria-hidden /> {engineInfo} · {Math.round(live.fps)} fps</span>}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        {/* Stage */}
        <div className="card relative aspect-[3/4] overflow-hidden bg-ink sm:aspect-video">
          <video ref={videoRef} playsInline muted className={`absolute inset-0 h-full w-full -scale-x-100 object-cover ${showCamera ? "" : "hidden"}`} />
          <canvas ref={canvasRef} className={`absolute inset-0 h-full w-full -scale-x-100 object-cover ${showCamera ? "" : "hidden"}`} />

          {phase === "live" && (
            <>
              <div className="absolute right-3 top-3 w-20 rounded-2xl bg-bg/85 p-2 text-brand backdrop-blur sm:w-28">
                <PoseFigure pose={pose} className="h-full w-full" strokeWidth={5} />
              </div>
              <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-bg/90 px-4 py-3 backdrop-blur" aria-live="polite">
                <p className={`text-base font-semibold sm:text-lg ${live.holding ? "text-good" : "text-ink"}`}>{live.cue}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-good transition-[width] duration-200" style={{ width: `${holdPct}%` }} />
                </div>
              </div>
            </>
          )}

          {phase === "loading" && (
            <div className="absolute inset-0 grid place-items-center bg-ink/70 text-bg">
              <div className="text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin" aria-hidden />
                <p className="mt-3 text-sm">Waking up the camera and AI model…</p>
              </div>
            </div>
          )}

          {(phase === "intro" || phase === "error") && (
            <div className="absolute inset-0 grid place-items-center bg-surface p-6">
              <div className="flex max-w-sm flex-col items-center text-center">
                <PoseFigure pose={pose} className="h-36 w-36 text-brand sm:h-44 sm:w-44" />
                {phase === "error" ? (
                  <p className="mt-4 text-sm text-bad" role="alert">{errorMsg}</p>
                ) : (
                  <p className="mt-4 text-sm text-muted">
                    {pose.view === "side" ? "Stand side-on to the camera" : "Face the camera"}, about 2–3 m away,
                    with your whole body in view.
                  </p>
                )}
                <button onClick={start} className="btn btn-primary mt-5">
                  <Camera className="h-4 w-4" aria-hidden /> {phase === "error" ? "Try again" : "Start camera"}
                </button>
                <label className="mt-4 flex cursor-pointer items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox" className="accent-[var(--brand)]"
                    checked={variant === "heavy"} onChange={(e) => setVariant(e.target.checked ? "heavy" : "full")}
                  />
                  High accuracy mode (heavier model, best on laptops)
                </label>
                <p className="mt-3 text-[11px] text-muted">Video is processed on this device and never uploaded.</p>
              </div>
            </div>
          )}

          {phase === "done" && summary && (
            <div className="absolute inset-0 grid place-items-center overflow-y-auto bg-surface p-6">
              <div className="w-full max-w-sm text-center">
                {summary.completed && <CheckCircle2 className="mx-auto h-10 w-10 text-good" aria-hidden />}
                <h2 className="mt-2 font-display text-2xl font-semibold">{summary.completed ? "Pose complete!" : "Session ended"}</h2>
                <div className="mt-5 grid grid-cols-3 gap-2">
                  <Stat label="Average" value={Math.round(summary.avgScore)} />
                  <Stat label="Best" value={Math.round(summary.bestScore)} />
                  <Stat label="Held" value={`${Math.round(summary.holdS)}s`} />
                </div>
                <p className="mt-4 text-xs text-muted">
                  {saveState === "saving" && "Saving to your progress…"}
                  {saveState === "saved" && "Saved to your progress."}
                  {saveState === "skipped" && "Session too short to save."}
                  {saveState === "error" && "Couldn't save this session. Your results are still shown here."}
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <button onClick={start} className="btn btn-ghost"><RotateCcw className="h-4 w-4" aria-hidden /> Again</button>
                  <button onClick={() => navigate(`/practice/${nextPose.id}`)} className="btn btn-primary">Next: {nextPose.name}</button>
                </div>
                <Link to="/progress" className="mt-4 inline-block text-sm font-semibold text-brand hover:underline">View progress</Link>
              </div>
            </div>
          )}
        </div>

        {/* Panel */}
        <aside className="flex flex-col gap-5">
          <div className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl font-semibold">{pose.name}</h1>
                <p className="text-sm italic text-muted">{pose.sanskrit}</p>
              </div>
              <span className="chip capitalize">{pose.level}</span>
            </div>

            {phase === "live" ? (
              <div className="mt-5 flex items-center gap-5">
                <ScoreRing score={live.score} size={112} />
                <div className="flex-1 space-y-3 text-sm">
                  <Metric label="Hold" value={`${Math.floor(live.holdS)} / ${pose.hold_seconds}s`} />
                  <Metric label="Time" value={formatTime(live.elapsedS)} />
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setVoiceOn((v) => !v)} className="btn btn-ghost !px-3 !py-2"
                      aria-pressed={voiceOn} aria-label={voiceOn ? "Mute voice coach" : "Unmute voice coach"}
                    >
                      {voiceOn ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
                    </button>
                    <button onClick={() => finishRef.current(false)} className="btn btn-ghost !px-3 !py-2">
                      <Square className="h-4 w-4" aria-hidden /> Finish
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <p className="mt-4 text-sm leading-relaxed text-muted">{pose.description}</p>
                <ul className="mt-4 space-y-2">
                  {pose.cues.map((c) => (
                    <li key={c} className="flex gap-2 text-sm"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{c}</li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {(phase === "live" || phase === "done") && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold">Joint alignment</h2>
              <JointBars
                rows={
                  phase === "live"
                    ? live.joints.map((j) => ({ joint: j.joint, score: j.score, detail: `${Math.round(j.angle)}° → ${j.target}°` }))
                    : (Object.entries(summary?.jointScores ?? {}) as [JointName, number][]).map(([joint, score]) => ({ joint, score }))
                }
              />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function drawSkeleton(ctx: CanvasRenderingContext2D, lm: { x: number; y: number }[], ev: Evaluation) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const scale = Math.max(w, h) / 640;
  const vertexColor = new Map<number, string>();
  for (const j of ev.joints) vertexColor.set(JOINT_LANDMARKS[j.joint][1], scoreColor(j.score));
  const css = getComputedStyle(document.documentElement);
  const resolve = (c: string) => (c.startsWith("var(") ? css.getPropertyValue(c.slice(4, -1)).trim() : c);

  ctx.lineCap = "round";
  ctx.lineWidth = 4 * scale;
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  for (const [a, b] of SKELETON) {
    if (!lm[a] || !lm[b]) continue;
    ctx.moveTo(lm[a].x * w, lm[a].y * h);
    ctx.lineTo(lm[b].x * w, lm[b].y * h);
  }
  ctx.stroke();

  for (const [i, color] of vertexColor) {
    const p = lm[i];
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 8 * scale, 0, Math.PI * 2);
    ctx.fillStyle = resolve(color);
    ctx.fill();
    ctx.lineWidth = 2.5 * scale;
    ctx.strokeStyle = "white";
    ctx.stroke();
  }
}

function JointBars({ rows }: { rows: { joint: JointName; score: number; detail?: string }[] }) {
  if (!rows.length) return <p className="mt-3 text-sm text-muted">Waiting for a clear view of your body…</p>;
  return (
    <ul className="mt-4 space-y-3">
      {rows.map((r) => (
        <li key={r.joint}>
          <div className="flex justify-between text-xs">
            <span className="font-medium capitalize">{jointLabel(r.joint)}</span>
            <span className="tabular-nums text-muted">{r.detail ?? `${Math.round(r.score)}%`}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${r.score}%`, background: scoreColor(r.score) }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-3">
      <div className="font-display text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-line pb-2">
      <span className="text-muted">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
