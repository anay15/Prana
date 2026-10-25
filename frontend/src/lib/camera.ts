import { isBackCamera, isWideLens } from "./framing";

const LAST_CAMERA = "prana.camera";

export interface CameraInfo {
  id: string;
  label: string;
  wide: boolean;
  back: boolean;
}

export interface OpenedCamera {
  stream: MediaStream;
  id: string;
  label: string;
  /** Selfie cameras are shown mirrored; rear cameras are not. */
  mirrored: boolean;
  wide: boolean;
}

export const portraitScreen = () => window.innerHeight > window.innerWidth;

/** Open a camera, asking for a stream shaped like the screen (portrait phones
 * get a tall stream, so more of a standing body fits). */
export async function openCamera(deviceId?: string | null): Promise<OpenedCamera> {
  const [w, h] = portraitScreen() ? [720, 1280] : [1280, 720];
  const shape = { width: { ideal: w }, height: { ideal: h } };
  const video: MediaTrackConstraints = deviceId ? { deviceId: { exact: deviceId }, ...shape } : { facingMode: "user", ...shape };
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
  } catch (err) {
    // A remembered camera may have been unplugged; fall back to the default
    if (deviceId && err instanceof DOMException && (err.name === "OverconstrainedError" || err.name === "NotFoundError")) {
      return openCamera(null);
    }
    throw err;
  }
  const track = stream.getVideoTracks()[0];
  const settings = track.getSettings();
  const label = track.label || "Camera";
  const back = settings.facingMode === "environment" || isBackCamera(label);
  const id = settings.deviceId ?? deviceId ?? "default";
  try {
    localStorage.setItem(LAST_CAMERA, id);
  } catch {
    /* ignore */
  }
  return { stream, id, label, mirrored: !back, wide: isWideLens(label) };
}

/** Cameras on this device. Labels are only available once permission is granted. */
export async function listCameras(): Promise<CameraInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "videoinput" && d.deviceId)
    .map((d, i) => ({
      id: d.deviceId,
      label: d.label || `Camera ${i + 1}`,
      wide: isWideLens(d.label),
      back: isBackCamera(d.label),
    }));
}

export function lastCameraId(): string | null {
  try {
    return localStorage.getItem(LAST_CAMERA);
  } catch {
    return null;
  }
}

/** Short, friendly label: "Back Ultra Wide Camera" -> "Back · wide 0.5×". */
export function cameraName(c: CameraInfo): string {
  const side = c.back ? "Back" : "Front";
  if (c.wide) return `${side} · wide 0.5×`;
  if (/telephoto|zoom|[23]x/i.test(c.label)) return `${side} · zoom`;
  return c.label.length > 28 ? `${side} camera` : c.label;
}
