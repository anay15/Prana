// Downloads the MediaPipe Pose Landmarker models (pinned version, SHA-256
// verified) and copies the WebAssembly runtime next to the app, so every ML
// asset is self-hosted from our own origin.
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://storage.googleapis.com/mediapipe-models/pose_landmarker";

const MODELS = [
  { name: "pose_landmarker_full", sha256: "5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1" },
  { name: "pose_landmarker_heavy", sha256: "64437af838a65d18e5ba7a0d39b465540069bc8aae8308de3e318aad31fcbc7b" },
];

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

const modelsDir = join(root, "public", "models");
await mkdir(modelsDir, { recursive: true });
for (const { name, sha256: expected } of MODELS) {
  const dest = join(modelsDir, `${name}_v1.task`);
  if (existsSync(dest) && sha256(await readFile(dest)) === expected) {
    console.log(`✓ ${name} (cached)`);
    continue;
  }
  const res = await fetch(`${BASE}/${name}/float16/1/${name}.task`, { redirect: "error" });
  if (!res.ok) throw new Error(`Failed to download ${name}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const actual = sha256(buf);
  if (actual !== expected) throw new Error(`Checksum mismatch for ${name}: ${actual}`);
  await writeFile(dest, buf);
  console.log(`✓ ${name} (${(buf.length / 1e6).toFixed(1)} MB, sha256 verified)`);
}

const wasmSrc = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const wasmDest = join(root, "public", "mediapipe", "wasm");
await mkdir(wasmDest, { recursive: true });
for (const file of ["vision_wasm_internal.js", "vision_wasm_internal.wasm", "vision_wasm_nosimd_internal.js", "vision_wasm_nosimd_internal.wasm"]) {
  await copyFile(join(wasmSrc, file), join(wasmDest, file));
}
console.log("✓ MediaPipe WASM runtime copied");
