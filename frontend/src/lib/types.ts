export type JointName =
  | "left_elbow" | "right_elbow"
  | "left_shoulder" | "right_shoulder"
  | "left_hip" | "right_hip"
  | "left_knee" | "right_knee";

export type FigurePoint =
  | "head"
  | "left_shoulder" | "right_shoulder" | "left_elbow" | "right_elbow" | "left_wrist" | "right_wrist"
  | "left_hip" | "right_hip" | "left_knee" | "right_knee" | "left_ankle" | "right_ankle";

export interface JointTarget {
  joint: JointName;
  angle: number;
  tolerance: number;
  weight: number;
}

export interface Pose {
  id: string;
  name: string;
  sanskrit: string;
  level: "beginner" | "intermediate";
  view: "front" | "side";
  mirror: boolean;
  hold_seconds: number;
  /** Room the pose needs on camera, in body heights. */
  space: { w: number; h: number };
  focus: string[];
  description: string;
  cues: string[];
  targets: JointTarget[];
  figure: Record<FigurePoint, [number, number]>;
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface SessionRecord {
  id: number;
  pose_id: string;
  created_at: string;
  duration_s: number;
  hold_s: number;
  avg_score: number;
  best_score: number;
  joint_scores: Partial<Record<JointName, number>>;
}

export interface Stats {
  total_sessions: number;
  total_minutes: number;
  total_hold_minutes: number;
  current_streak_days: number;
  daily: { date: string; minutes: number }[];
  per_pose: { pose_id: string; best_score: number; sessions: number }[];
  weekly_goal: WeeklyGoal;
}

export type Level = "beginner" | "intermediate" | "advanced";

export interface Me {
  authenticated: boolean;
  is_guest: boolean;
  email: string | null;
  display_name: string | null;
  experience_level: Level;
  weekly_goal_days: number;
  has_password: boolean;
  has_google: boolean;
  created_at: string | null;
}

export interface WeeklyGoal {
  goal_days: number;
  days_done: number;
  week_start: string;
}

export interface PoseHistory {
  pose_id: string;
  sessions: { created_at: string; avg_score: number; best_score: number; hold_s: number }[];
  joints: { joint: JointName; score: number }[];
}

export interface Recommendation {
  pose_id: string;
  reason: string;
  kind: "new" | "weak_joint" | "stale" | "improve";
}
