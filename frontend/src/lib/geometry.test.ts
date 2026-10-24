import { describe, expect, it } from "vitest";
import { angleAt, coachingCue, evaluatePose, jointScore, measureAngles, mirrorTargets } from "./geometry";
import type { JointTarget, Point3 } from "./types";

const p = (x: number, y: number, z = 0): Point3 => ({ x, y, z, visibility: 1 });

describe("angleAt", () => {
  it("measures right angles and straight lines", () => {
    expect(angleAt(p(1, 0), p(0, 0), p(0, 1))).toBeCloseTo(90);
    expect(angleAt(p(-1, 0), p(0, 0), p(1, 0))).toBeCloseTo(180);
  });
  it("works in 3D, independent of viewpoint", () => {
    expect(angleAt(p(1, 0, 0), p(0, 0, 0), p(0, 0, 1))).toBeCloseTo(90);
  });
  it("returns NaN for degenerate input", () => {
    expect(angleAt(p(0, 0), p(0, 0), p(1, 0))).toBeNaN();
  });
});

describe("jointScore", () => {
  const t: JointTarget = { joint: "left_knee", angle: 90, tolerance: 10, weight: 1 };
  it("is perfect within tolerance", () => expect(jointScore(98, t)).toBe(100));
  it("falls off linearly beyond tolerance", () => expect(jointScore(120, t)).toBe(50));
  it("never goes negative", () => expect(jointScore(180, t)).toBe(0));
});

describe("evaluatePose", () => {
  const pose = {
    mirror: true,
    targets: [
      { joint: "left_knee", angle: 90, tolerance: 10, weight: 1 },
      { joint: "right_knee", angle: 180, tolerance: 10, weight: 1 },
    ] as JointTarget[],
  };
  it("picks the better side for mirrored poses", () => {
    const e = evaluatePose({ left_knee: 180, right_knee: 90 }, pose);
    expect(e.mirrored).toBe(true);
    expect(e.score).toBe(100);
  });
  it("reports coverage when joints are hidden", () => {
    const e = evaluatePose({ left_knee: 90 }, { ...pose, mirror: false });
    expect(e.coverage).toBe(0.5);
  });
  it("mirrors target joint names", () => {
    expect(mirrorTargets(pose.targets).map((t) => t.joint)).toEqual(["right_knee", "left_knee"]);
  });
});

describe("coachingCue", () => {
  it("tells you to straighten a bent knee", () => {
    const e = evaluatePose({ left_knee: 120 }, { mirror: false, targets: [{ joint: "left_knee", angle: 178, tolerance: 10, weight: 1 }] });
    expect(coachingCue(e)?.text).toBe("Straighten your left leg");
  });
  it("is silent when everything is aligned", () => {
    const e = evaluatePose({ left_knee: 175 }, { mirror: false, targets: [{ joint: "left_knee", angle: 178, tolerance: 10, weight: 1 }] });
    expect(coachingCue(e)).toBeNull();
  });
});

describe("measureAngles", () => {
  it("skips joints with low landmark visibility", () => {
    const world = Array.from({ length: 33 }, (_, i) => p(i, i % 3));
    const image = world.map((pt, i) => ({ ...pt, visibility: i === 25 ? 0.1 : 0.9 }));
    const angles = measureAngles(world, image);
    expect(angles.left_knee).toBeUndefined();
    expect(angles.right_knee).toBeDefined();
  });
});
