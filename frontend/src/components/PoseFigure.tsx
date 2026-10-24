import type { FigurePoint, JointName, Pose } from "../lib/types";

type Pt = [number, number];

const BONES: [FigurePoint, FigurePoint][] = [
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
  ["left_hip", "right_hip"],
  ["left_hip", "left_knee"], ["left_knee", "left_ankle"],
  ["right_hip", "right_knee"], ["right_knee", "right_ankle"],
];

const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

interface Props {
  pose: Pick<Pose, "figure" | "name">;
  className?: string;
  /** Optional per-joint colours, e.g. to highlight joints that need work. */
  jointColors?: Partial<Record<JointName, string>>;
  strokeWidth?: number;
}

/** Minimal line-art illustration of a pose, drawn from its skeleton. */
export function PoseFigure({ pose, className, jointColors, strokeWidth = 4.5 }: Props) {
  const f = pose.figure;
  const neck = mid(f.left_shoulder, f.right_shoulder);
  const pelvis = mid(f.left_hip, f.right_hip);
  const headR = 6.5;
  return (
    <svg viewBox="-4 -4 108 108" className={className} role="img" aria-label={`${pose.name} illustration`}>
      <g stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <line x1={neck[0]} y1={neck[1]} x2={pelvis[0]} y2={pelvis[1]} />
        <line x1={neck[0]} y1={neck[1]} x2={f.head[0]} y2={f.head[1]} />
        {BONES.map(([a, b]) => (
          <line key={`${a}-${b}`} x1={f[a][0]} y1={f[a][1]} x2={f[b][0]} y2={f[b][1]} />
        ))}
      </g>
      <circle cx={f.head[0]} cy={f.head[1]} r={headR} fill="currentColor" />
      {jointColors &&
        (Object.entries(jointColors) as [JointName, string][]).map(([joint, color]) => (
          <circle key={joint} cx={f[joint][0]} cy={f[joint][1]} r={3.6} fill={color} stroke="var(--surface)" strokeWidth={1.5} />
        ))}
    </svg>
  );
}
