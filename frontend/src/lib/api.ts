import type { Pose, SessionRecord, Stats } from "./types";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...init,
    headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  if (!res.ok) {
    const message = res.status === 429 ? "You're going a bit fast — try again in a moment." : "Something went wrong talking to the server.";
    throw new ApiError(res.status, message);
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

export const api = {
  poses: () => request<Pose[]>("/poses"),
  sessions: (limit = 50) => request<SessionRecord[]>(`/sessions?limit=${encodeURIComponent(limit)}`),
  stats: () => request<Stats>(`/stats?tz_offset=${-new Date().getTimezoneOffset()}`),
  saveSession: (body: NewSession) => request<SessionRecord>("/sessions", { method: "POST", body: JSON.stringify(body) }),
  deleteMyData: () => request<void>("/sessions", { method: "DELETE" }),
};
