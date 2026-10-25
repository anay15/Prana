import type { Point3, Pose } from "./types";

/**
 * Framing & room awareness.
 *
 * All sizes here are measured in *body heights*, so they don't depend on how
 * tall the user is or on MediaPipe's absolute metric scale:
 *   - a pose "needs" e.g. 1.5 body-heights of width (Warrior II)
 *   - the camera "sees" e.g. 1.2 x 1.6 body-heights at the user's distance
 */

// --------------------------------------------------------------- frame cut-off

const VIS = 0.5;
const EDGE = 0.02;
const HEAD = [0, 2, 5, 7, 8];
const FEET = [27, 28];
const EXTREMITIES = [0, 15, 16, 27, 28];

export interface Cutoff {
  top: boolean;
  bottom: boolean;
  left: boolean; // in the mirrored on-screen view
  right: boolean;
}

const seen = (p?: Point3) => !!p && (p.visibility ?? 1) >= VIS;

/** Which edges of the (mirrored) preview the body is spilling over. */
export function detectCutoff(image: Point3[]): Cutoff {
  const headSeen = HEAD.filter((i) => seen(image[i]) && image[i].y > EDGE).length;
  const feetSeen = FEET.filter((i) => seen(image[i]) && image[i].y < 1 - EDGE).length;
  const handsAbove = [15, 16].some((i) => image[i] && image[i].y < 0);
  const xs = EXTREMITIES.map((i) => image[i]).filter(seen).map((p) => p.x);
  // Camera x runs opposite to the mirrored preview the user sees
  return {
    top: headSeen < 2 || handsAbove,
    bottom: feetSeen < 2,
    left: xs.some((x) => x > 1 - EDGE),
    right: xs.some((x) => x < EDGE),
  };
}

// --------------------------------------------------------------- space measurement

/** Segment [a, b] and its typical length as a fraction of standing height. */
const SEGMENTS: [number, number, number][] = [
  [11, 23, 0.3], [12, 24, 0.3], // shoulder–hip
  [23, 25, 0.245], [24, 26, 0.245], // thigh
  [25, 27, 0.246], [26, 28, 0.246], // shin
  [11, 13, 0.186], [12, 14, 0.186], // upper arm
];

const dist3 = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export interface Window {
  /** Visible frame width/height at the user's distance, in body heights. */
  w: number;
  h: number;
}

/**
 * Estimate how many body-heights the camera sees at the user's distance.
 * `aspect` is videoWidth / videoHeight. Returns null without enough body.
 */
export function measureWindow(image: Point3[], world: Point3[], aspect: number): Window | null {
  const ratios: number[] = []; // on-screen length (frame heights) per metre
  const heights: number[] = []; // implied standing height (metres)
  for (const [a, b, share] of SEGMENTS) {
    if (!seen(image[a]) || !seen(image[b]) || !world[a] || !world[b]) continue;
    const worldLen = dist3(world[a], world[b]);
    if (worldLen < 0.05) continue;
    const imgLen = Math.hypot((image[a].x - image[b].x) * aspect, image[a].y - image[b].y);
    ratios.push(imgLen / worldLen);
    heights.push(worldLen / share);
  }
  if (ratios.length < 3) return null;
  // Segments pointing at the camera look shorter than they are, so the least
  // foreshortened one (largest on-screen/real ratio) gives the true scale.
  const scale = Math.max(...ratios);
  const h = 1 / (scale * median(heights));
  return { w: h * aspect, h };
}

// --------------------------------------------------------------- pose requirements

const STANDING_HEIGHT = 84.5; // Mountain Pose figure, head top to ankle
const HEAD_R = 6.5;
const MARGIN = 1.08; // a little breathing room around the body

type Sized = Pick<Pose, "figure"> & { space?: Pose["space"] };

/** Space a pose needs on camera, in body heights. Uses the pose library's
 * measured `space`; falls back to the (stylised) illustration skeleton. */
export function poseExtent(pose: Sized): Window {
  if (pose.space) return { w: pose.space.w * MARGIN, h: pose.space.h * MARGIN };
  const pts = Object.entries(pose.figure);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [name, [x, y]] of pts) {
    const r = name === "head" ? HEAD_R : 0;
    minX = Math.min(minX, x - r);
    maxX = Math.max(maxX, x + r);
    minY = Math.min(minY, y - r);
    maxY = Math.max(maxY, y + r);
  }
  return { w: ((maxX - minX) / STANDING_HEIGHT) * MARGIN, h: ((maxY - minY) / STANDING_HEIGHT) * MARGIN };
}

// --------------------------------------------------------------- room profile

export interface RoomProfile {
  /** Largest window measured on this camera, i.e. the user's room limit. */
  w: number;
  h: number;
  portrait: boolean;
  measuredAt: number;
}

/** A wide (0.5x) lens roughly doubles what fits; conservative estimate. */
export const WIDE_LENS_GAIN = 1.7;

export type FitVerdict =
  | { kind: "fits" }
  | { kind: "rotate"; to: "portrait" | "landscape" }
  | { kind: "wide-lens" }
  | { kind: "tight"; cut: "feet" | "hands" | "sides" };

/** Does `pose` fit in the room/camera described by `room`, and if not, what helps? */
export function assessFit(pose: Sized, room: Window & { portrait?: boolean }, hasWideLens = false): FitVerdict {
  const need = poseExtent(pose);
  const fits = (win: Window) => win.w >= need.w && win.h >= need.h;
  if (fits(room)) return { kind: "fits" };
  // Rotating the phone swaps the camera's horizontal and vertical field of view
  if (fits({ w: room.h, h: room.w })) {
    return { kind: "rotate", to: room.portrait ?? room.h > room.w ? "landscape" : "portrait" };
  }
  if (hasWideLens && fits({ w: room.w * WIDE_LENS_GAIN, h: room.h * WIDE_LENS_GAIN })) return { kind: "wide-lens" };
  const shortW = need.w / room.w;
  const shortH = need.h / room.h;
  return { kind: "tight", cut: shortW > shortH ? "sides" : need.h > 1.05 ? "hands" : "feet" };
}

export function fitAdvice(verdict: FitVerdict): string {
  switch (verdict.kind) {
    case "fits":
      return "Fits your space";
    case "rotate":
      return verdict.to === "landscape" ? "Turn your phone sideways (landscape) for this pose" : "Hold your phone upright (portrait) for this pose";
    case "wide-lens":
      return "Switch to your wide (0.5×) camera for this pose";
    case "tight":
      return verdict.cut === "feet"
        ? "Tight fit: your feet may be cut off, so Prana will score the joints it can see"
        : verdict.cut === "hands"
          ? "Tight fit: your hands may be cut off, so Prana will score the joints it can see"
          : "Tight fit: stand in the middle; Prana will score the joints it can see";
  }
}

/** A specific, actionable hint for what's cut off right now. */
export function framingHint(cut: Cutoff, atRoomLimit: boolean, verdict: FitVerdict | null): string | null {
  const { top, bottom, left, right } = cut;
  if (!top && !bottom && !left && !right) return null;
  if (atRoomLimit && verdict && verdict.kind !== "fits") return fitAdvice(verdict);
  if (top && bottom) return atRoomLimit ? "Lean the camera back a little, or try your wide camera" : "Step back a little so I can see all of you";
  if (bottom) return "Your feet are out of frame. Tilt the camera down slightly, or lower it to hip height";
  if (top) return "Your head or hands are out of frame. Tilt the camera up slightly";
  return left ? "Move a little to your right, toward the centre" : "Move a little to your left, toward the centre";
}

// --------------------------------------------------------------- persistence

const KEY = "prana.room.v1";

/** Room profiles are per camera (lenses differ), stored only in this browser. */
export function loadRoom(cameraId: string): RoomProfile | null {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, RoomProfile>;
    const p = all[cameraId];
    return p && Number.isFinite(p.w) && Number.isFinite(p.h) ? p : null;
  } catch {
    return null;
  }
}

export function saveRoom(cameraId: string, profile: RoomProfile) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, RoomProfile>;
    all[cameraId] = profile;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable (private mode): adaptation still works for this session */
  }
}

/** Keep the largest window seen: that's how far back this room lets the user go. */
export function growRoom(prev: RoomProfile | null, win: Window, portrait: boolean): RoomProfile {
  if (prev && prev.portrait === portrait && prev.w * prev.h >= win.w * win.h) return prev;
  return { w: win.w, h: win.h, portrait, measuredAt: Date.now() };
}

export const isWideLens = (label: string) => /ultra ?wide|0\.5|wide[- ]angle/i.test(label);
export const isBackCamera = (label: string) => /back|rear|environment|world/i.test(label);
