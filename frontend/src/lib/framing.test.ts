import { describe, expect, it } from "vitest";
import { assessFit, detectCutoff, framingHint, growRoom, isWideLens, measureWindow, poseExtent } from "./framing";
import type { Point3, Pose } from "./types";

const fig = (points: Record<string, [number, number]>) => ({ figure: points }) as unknown as Pick<Pose, "figure">;

// Mountain Pose and Warrior II skeletons (same as the backend library)
const mountain = fig({
  head: [50, 12], left_shoulder: [58, 24], right_shoulder: [42, 24], left_elbow: [61, 40], right_elbow: [39, 40],
  left_wrist: [62, 54], right_wrist: [38, 54], left_hip: [55, 54], right_hip: [45, 54], left_knee: [55, 72],
  right_knee: [45, 72], left_ankle: [55, 90], right_ankle: [45, 90],
});
const warrior = fig({
  head: [50, 20], left_shoulder: [57, 32], right_shoulder: [43, 32], left_elbow: [72, 32], right_elbow: [28, 32],
  left_wrist: [88, 32], right_wrist: [12, 32], left_hip: [54, 56], right_hip: [46, 56], left_knee: [72, 64],
  right_knee: [32, 72], left_ankle: [72, 90], right_ankle: [18, 90],
});

/** A standing person, `bodyFrac` of the frame tall, centred, facing the camera. */
function standing(bodyFrac: number, aspect: number): { image: Point3[]; world: Point3[] } {
  const H = 1.7; // metres
  // [x, y] in metres from the top of the head, for the joints the estimator uses
  const joints: Record<number, [number, number]> = {
    0: [0, 0.1], 2: [0.03, 0.08], 5: [-0.03, 0.08], 7: [0.07, 0.1], 8: [-0.07, 0.1],
    11: [0.2, 0.26], 12: [-0.2, 0.26], 13: [0.23, 0.26 + 0.186 * H], 14: [-0.23, 0.26 + 0.186 * H],
    15: [0.24, 0.85], 16: [-0.24, 0.85],
    23: [0.1, 0.26 + 0.3 * H], 24: [-0.1, 0.26 + 0.3 * H],
    25: [0.1, 0.26 + 0.545 * H], 26: [-0.1, 0.26 + 0.545 * H],
    27: [0.1, 0.26 + 0.791 * H], 28: [-0.1, 0.26 + 0.791 * H],
  };
  const image: Point3[] = [];
  const world: Point3[] = [];
  for (let i = 0; i < 33; i++) {
    const j = joints[i];
    if (!j) {
      image.push({ x: 0.5, y: 0.5, z: 0, visibility: 0 });
      world.push({ x: 0, y: 0, z: 0 });
      continue;
    }
    const top = (1 - bodyFrac) / 2;
    image.push({ x: 0.5 + (j[0] / H) * bodyFrac / aspect, y: top + (j[1] / H) * bodyFrac, z: 0, visibility: 0.99 });
    world.push({ x: j[0], y: j[1], z: 0 });
  }
  return { image, world };
}

describe("measureWindow", () => {
  it("recovers the frame size in body heights", () => {
    const { image, world } = standing(0.5, 9 / 16);
    const win = measureWindow(image, world, 9 / 16)!;
    expect(win.h).toBeCloseTo(2, 1); // body fills half the height -> 2 body-heights tall
    expect(win.w).toBeCloseTo(2 * (9 / 16), 1);
  });

  it("ignores a limb pointing at the camera (foreshortening)", () => {
    const { image, world } = standing(0.5, 9 / 16);
    world[13] = { ...world[13], z: -0.3 }; // upper arm reaching toward the lens
    world[14] = { ...world[14], z: -0.3 };
    expect(measureWindow(image, world, 9 / 16)!.h).toBeCloseTo(2, 1);
  });

  it("needs enough of the body", () => {
    const { image, world } = standing(0.5, 1);
    image.forEach((p, i) => i > 12 && (p.visibility = 0));
    expect(measureWindow(image, world, 1)).toBeNull();
  });
});

describe("poseExtent", () => {
  it("falls back to the skeleton: about one body-height tall for Mountain Pose", () => {
    const e = poseExtent(mountain);
    expect(e.h).toBeGreaterThan(1.05);
    expect(e.h).toBeLessThan(1.2);
    expect(e.w).toBeLessThan(0.4);
  });
  it("prefers the measured space requirement", () => {
    expect(poseExtent({ ...warrior, space: { w: 1.45, h: 0.9 } }).w).toBeCloseTo(1.57, 2);
  });
});

describe("assessFit", () => {
  const warriorII = { ...warrior, space: { w: 1.45, h: 0.9 } };
  it("fits when there's room", () => {
    expect(assessFit(mountain, { w: 1, h: 1.8 }).kind).toBe("fits");
  });
  it("suggests rotating for a wide pose in portrait", () => {
    // A 9:16 portrait phone seeing 1.8 body-heights tall
    expect(assessFit(warriorII, { w: 1.01, h: 1.8, portrait: true })).toEqual({ kind: "rotate", to: "landscape" });
  });
  it("suggests the wide lens when rotating isn't enough", () => {
    expect(assessFit(warriorII, { w: 1.0, h: 0.75 }, true).kind).toBe("wide-lens");
  });
  it("falls back to scoring visible joints in a tiny room", () => {
    expect(assessFit(mountain, { w: 0.6, h: 0.75 }).kind).toBe("tight");
  });
});

describe("detectCutoff / framingHint", () => {
  it("spots cut-off feet and gives a specific hint", () => {
    const { image } = standing(0.5, 1);
    image[27].y = 1.05;
    image[28].y = 1.05;
    const cut = detectCutoff(image);
    expect(cut).toMatchObject({ bottom: true, top: false });
    expect(framingHint(cut, false, null)).toMatch(/feet/);
  });
  it("is quiet when everything is in frame", () => {
    const { image } = standing(0.5, 1);
    expect(framingHint(detectCutoff(image), false, null)).toBeNull();
  });
  it("gives room advice at the room limit", () => {
    const { image } = standing(0.5, 1);
    image[27].visibility = 0;
    image[28].visibility = 0;
    const hint = framingHint(detectCutoff(image), true, { kind: "wide-lens" });
    expect(hint).toMatch(/wide/);
  });
});

describe("room profile", () => {
  it("keeps the largest window seen", () => {
    const a = growRoom(null, { w: 1, h: 1.5 }, true);
    expect(growRoom(a, { w: 0.8, h: 1.2 }, true)).toBe(a);
    expect(growRoom(a, { w: 1.2, h: 1.8 }, true).h).toBe(1.8);
  });
  it("recognises wide lenses", () => {
    expect(isWideLens("Back Ultra Wide Camera")).toBe(true);
    expect(isWideLens("camera2 2, facing back (0.5x)")).toBe(true);
    expect(isWideLens("FaceTime HD Camera")).toBe(false);
  });
});
