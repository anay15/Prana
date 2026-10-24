import type { JointName, JointTarget, Point3, Pose } from "./types";

/** MediaPipe BlazePose landmark indices for each joint: [a, vertex, c]. */
export const JOINT_LANDMARKS: Record<JointName, [number, number, number]> = {
  left_elbow: [11, 13, 15],
  right_elbow: [12, 14, 16],
  left_shoulder: [23, 11, 13],
  right_shoulder: [24, 12, 14],
  left_hip: [11, 23, 25],
  right_hip: [12, 24, 26],
  left_knee: [23, 25, 27],
  right_knee: [24, 26, 28],
};

/** Skeleton edges drawn on the camera overlay. */
export const SKELETON: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 31], [28, 32], [27, 29], [28, 30],
];

const MIN_VISIBILITY = 0.5;
/** Degrees beyond tolerance at which a joint's score reaches zero. */
const FALLOFF = 40;

/** Interior angle at `b` (degrees, 0-180) formed by points a-b-c in 3D. */
export function angleAt(a: Point3, b: Point3, c: Point3): number {
  const v1 = [a.x - b.x, a.y - b.y, a.z - b.z];
  const v2 = [c.x - b.x, c.y - b.y, c.z - b.z];
  const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  const n1 = Math.hypot(v1[0], v1[1], v1[2]);
  const n2 = Math.hypot(v2[0], v2[1], v2[2]);
  if (n1 === 0 || n2 === 0) return NaN;
  const cos = Math.min(1, Math.max(-1, dot / (n1 * n2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Joint angles from world landmarks; joints whose landmarks are not
 * confidently visible (per the 2D landmarks) are omitted. */
export function measureAngles(world: Point3[], image: Point3[]): Partial<Record<JointName, number>> {
  const out: Partial<Record<JointName, number>> = {};
  for (const [joint, [a, b, c]] of Object.entries(JOINT_LANDMARKS) as [JointName, [number, number, number]][]) {
    const visible = [a, b, c].every((i) => (image[i]?.visibility ?? 1) >= MIN_VISIBILITY);
    if (!visible || !world[a] || !world[b] || !world[c]) continue;
    const angle = angleAt(world[a], world[b], world[c]);
    if (!Number.isNaN(angle)) out[joint] = angle;
  }
  return out;
}

export function jointScore(angle: number, target: JointTarget): number {
  const err = Math.abs(angle - target.angle);
  if (err <= target.tolerance) return 100;
  return Math.max(0, 100 - ((err - target.tolerance) * 100) / FALLOFF);
}

const swapSide = (joint: JointName): JointName =>
  (joint.startsWith("left_") ? joint.replace("left_", "right_") : joint.replace("right_", "left_")) as JointName;

export function mirrorTargets(targets: JointTarget[]): JointTarget[] {
  return targets.map((t) => ({ ...t, joint: swapSide(t.joint) }));
}

export interface JointResult {
  joint: JointName;
  angle: number;
  target: number;
  score: number;
  /** Signed error: positive means the joint is more open than the target. */
  error: number;
  withinTolerance: boolean;
}

export interface Evaluation {
  score: number;
  /** Share of the pose's weighted joints that were visible (0-1). */
  coverage: number;
  joints: JointResult[];
  mirrored: boolean;
}

function evaluateTargets(angles: Partial<Record<JointName, number>>, targets: JointTarget[], mirrored: boolean): Evaluation {
  let total = 0;
  let weighted = 0;
  let visibleWeight = 0;
  const joints: JointResult[] = [];
  for (const t of targets) {
    total += t.weight;
    const angle = angles[t.joint];
    if (angle === undefined) continue;
    const score = jointScore(angle, t);
    visibleWeight += t.weight;
    weighted += score * t.weight;
    joints.push({
      joint: t.joint,
      angle,
      target: t.angle,
      score,
      error: angle - t.angle,
      withinTolerance: Math.abs(angle - t.angle) <= t.tolerance,
    });
  }
  return {
    score: visibleWeight ? weighted / visibleWeight : 0,
    coverage: total ? visibleWeight / total : 0,
    joints,
    mirrored,
  };
}

/** Score a pose; for poses done on either side, keep the better orientation. */
export function evaluatePose(angles: Partial<Record<JointName, number>>, pose: Pick<Pose, "targets" | "mirror">): Evaluation {
  const direct = evaluateTargets(angles, pose.targets, false);
  if (!pose.mirror) return direct;
  const flipped = evaluateTargets(angles, mirrorTargets(pose.targets), true);
  return flipped.score * flipped.coverage > direct.score * direct.coverage ? flipped : direct;
}

const PHRASES: Record<string, [tooClosed: string, tooOpen: string]> = {
  elbow: ["Straighten your {side} arm", "Soften your {side} elbow a little"],
  knee: ["Straighten your {side} leg", "Bend your {side} knee more"],
  shoulder: ["Raise your {side} arm higher", "Lower your {side} arm a little"],
  hip: ["Open up at your {side} hip", "Fold deeper from your {side} hip"],
};

/** A short spoken/visual correction for the joint that needs it most. */
export function coachingCue(evaluation: Evaluation): { joint: JointName; text: string } | null {
  const off = evaluation.joints.filter((j) => !j.withinTolerance).sort((a, b) => a.score - b.score);
  const worst = off[0];
  if (!worst) return null;
  const [side, kind] = worst.joint.split("_");
  const [tooClosed, tooOpen] = PHRASES[kind];
  return { joint: worst.joint, text: (worst.error < 0 ? tooClosed : tooOpen).replace("{side}", side) };
}

/** Exponential smoothing of per-joint angles to suppress landmark jitter. */
export function smoothAngles(
  prev: Partial<Record<JointName, number>>,
  next: Partial<Record<JointName, number>>,
  alpha = 0.4,
): Partial<Record<JointName, number>> {
  const out: Partial<Record<JointName, number>> = {};
  for (const [joint, value] of Object.entries(next) as [JointName, number][]) {
    const p = prev[joint];
    out[joint] = p === undefined ? value : p + alpha * (value - p);
  }
  return out;
}

export const jointLabel = (joint: JointName) => joint.replace("_", " ");
