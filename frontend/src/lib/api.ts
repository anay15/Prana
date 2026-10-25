import type { Level, Me, Pose, PoseHistory, Recommendation, SessionRecord, Stats } from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const FALLBACK: Record<number, string> = {
  401: "Please sign in to continue.",
  422: "Some details don't look right. Please check and try again.",
  429: "You're going a bit fast. Try again in a moment.",
};

// Validation failures name the offending fields; "" is a whole-body check (e.g. weak password)
const FIELD_HINTS: [string, string][] = [
  ["email", "Please enter a valid email address."],
  ["password", "Use at least 10 characters for your password."],
  ["", "That password is too easy to guess. Try a longer or less common one."],
  ["display_name", "Names can be up to 60 characters."],
];

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...init,
    headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  if (!res.ok) {
    // The API only returns safe, human-readable details for 4xx responses
    let body: { detail?: unknown; fields?: unknown } | null = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error body */
    }
    if (res.status === 422 && Array.isArray(body?.fields)) {
      const hint = FIELD_HINTS.find(([field]) => (body!.fields as string[]).some((f) => f === field || f === ""));
      if (hint) throw new ApiError(422, hint[1]);
    }
    const detail = body?.detail;
    const useDetail = res.status < 500 && res.status !== 422 && typeof detail === "string" && detail.length < 200;
    throw new ApiError(res.status, useDetail ? detail : (FALLBACK[res.status] ?? "Something went wrong talking to the server."));
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export interface NewSession {
  pose_id: string;
  duration_s: number;
  hold_s: number;
  avg_score: number;
  best_score: number;
  joint_scores: Record<string, number>;
}

export interface ProfileChanges {
  display_name?: string | null;
  experience_level?: Level;
  weekly_goal_days?: number;
}

const json = (body: unknown) => ({ body: JSON.stringify(body) });
const tz = () => -new Date().getTimezoneOffset();

export const api = {
  config: () => request<{ google_client_id: string | null }>("/config"),
  poses: () => request<Pose[]>("/poses"),
  sessions: (limit = 50) => request<SessionRecord[]>(`/sessions?limit=${encodeURIComponent(limit)}`),
  stats: () => request<Stats>(`/stats?tz_offset=${tz()}`),
  saveSession: (body: NewSession) => request<SessionRecord>("/sessions", { method: "POST", ...json(body) }),
  deleteMyData: () => request<void>("/sessions", { method: "DELETE" }),
  history: (poseId: string) => request<PoseHistory>(`/poses/${encodeURIComponent(poseId)}/history`),
  recommendations: () => request<Recommendation[]>("/recommendations"),

  me: () => request<Me>("/me"),
  signUp: (email: string, password: string, display_name?: string) =>
    request<Me>("/auth/signup", { method: "POST", ...json({ email, password, display_name: display_name || null }) }),
  logIn: (email: string, password: string) => request<Me>("/auth/login", { method: "POST", ...json({ email, password }) }),
  google: (credential: string) => request<Me>("/auth/google", { method: "POST", ...json({ credential }) }),
  logOut: () => request<void>("/auth/logout", { method: "POST" }),
  updateProfile: (changes: ProfileChanges) => request<Me>("/me", { method: "PATCH", ...json(changes) }),
  deleteAccount: () => request<void>("/me", { method: "DELETE" }),
};
