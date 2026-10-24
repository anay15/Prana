import { FilesetResolver, PoseLandmarker, type PoseLandmarkerResult } from "@mediapipe/tasks-vision";

export type ModelVariant = "full" | "heavy";

const MODEL_URL: Record<ModelVariant, string> = {
  full: "/models/pose_landmarker_full_v1.task",
  heavy: "/models/pose_landmarker_heavy_v1.task",
};

/** Heavier model on capable desktops, the balanced one on phones/tablets. */
export function defaultVariant(): ModelVariant {
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  return !coarse && cores >= 8 ? "heavy" : "full";
}

export interface LoadedEngine {
  landmarker: PoseLandmarker;
  delegate: "GPU" | "CPU";
  variant: ModelVariant;
}

let filesetPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;

/** Load BlazePose GHUM (MediaPipe Pose Landmarker), preferring the GPU
 * (WebGL2) delegate and falling back to CPU (WASM SIMD). */
export async function loadPoseEngine(variant: ModelVariant): Promise<LoadedEngine> {
  filesetPromise ??= FilesetResolver.forVisionTasks("/mediapipe/wasm");
  const fileset = await filesetPromise;
  for (const delegate of ["GPU", "CPU"] as const) {
    try {
      const landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL[variant], delegate },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      return { landmarker, delegate, variant };
    } catch (err) {
      if (delegate === "CPU") throw err;
      console.warn("GPU delegate unavailable, falling back to CPU", err);
    }
  }
  throw new Error("unreachable");
}

export type { PoseLandmarkerResult };
