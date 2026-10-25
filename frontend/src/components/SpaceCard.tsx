import { Check, Maximize2, RotateCw, ScanLine } from "lucide-react";
import { Link } from "react-router-dom";
import { assessFit, fitAdvice, type FitVerdict, type RoomProfile } from "../lib/framing";
import type { Pose } from "../lib/types";

const STYLE: Record<FitVerdict["kind"], { icon: typeof Check; label: string; tone: string }> = {
  fits: { icon: Check, label: "Fits your space", tone: "bg-good/15 text-good" },
  rotate: { icon: RotateCw, label: "Rotate phone", tone: "bg-warn/15 text-warn" },
  "wide-lens": { icon: Maximize2, label: "Use wide camera", tone: "bg-warn/15 text-warn" },
  tight: { icon: ScanLine, label: "Tight fit", tone: "bg-warn/15 text-warn" },
};

export function FitChip({ verdict, compact = false }: { verdict: FitVerdict; compact?: boolean }) {
  const { icon: Icon, label, tone } = STYLE[verdict.kind];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${tone}`} title={fitAdvice(verdict)}>
      <Icon className="h-3 w-3" aria-hidden /> {compact ? label : fitAdvice(verdict)}
    </span>
  );
}

/** What the camera can see in this room, and which poses fit it. */
export function SpaceCard({ room, poses, current, hasWideLens, live }: {
  room: RoomProfile | null;
  poses: Pose[];
  current: Pose;
  hasWideLens: boolean;
  live: boolean;
}) {
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Your space</h2>
        {room && (
          <span className="text-xs tabular-nums text-muted">
            {room.w.toFixed(1)} × {room.h.toFixed(1)} body-heights · {room.portrait ? "portrait" : "landscape"}
          </span>
        )}
      </div>
      {!room ? (
        <p className="mt-2 text-sm text-muted">
          {live
            ? "Prana learns how much room you have as you move. Tap “Measure my space” and step back as far as you can for an instant read."
            : "Start the camera and Prana will learn how much room you have, then tell you which poses fit and how to adjust."}
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {poses.map((p) => {
            const verdict = assessFit(p, room, hasWideLens);
            return (
              <li key={p.id} className={`flex items-center justify-between gap-2 rounded-xl px-2 py-1 text-sm ${p.id === current.id ? "bg-surface-2" : ""}`}>
                <Link to={`/practice/${p.id}`} className="truncate hover:underline">{p.name}</Link>
                <FitChip verdict={verdict} compact />
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-muted">Measured on this device only, per camera.</p>
    </section>
  );
}
