from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .poses import POSE_IDS

JointName = Literal[
    "left_elbow",
    "right_elbow",
    "left_shoulder",
    "right_shoulder",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
]
Score = Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)]


class SessionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pose_id: str = Field(min_length=2, max_length=40)
    duration_s: float = Field(gt=0, le=3600, allow_inf_nan=False)
    hold_s: float = Field(ge=0, le=3600, allow_inf_nan=False)
    avg_score: Score
    best_score: Score
    joint_scores: dict[JointName, Score] = Field(default_factory=dict, max_length=8)

    @field_validator("pose_id")
    @classmethod
    def known_pose(cls, v: str) -> str:
        if v not in POSE_IDS:
            raise ValueError("unknown pose")
        return v

    @field_validator("joint_scores")
    @classmethod
    def round_scores(cls, v: dict[str, float]) -> dict[str, float]:
        return {k: round(s, 1) for k, s in v.items()}

    @model_validator(mode="after")
    def consistent(self) -> "SessionIn":
        if self.hold_s > self.duration_s + 1:
            raise ValueError("hold time exceeds duration")
        if self.avg_score > self.best_score + 0.01:
            raise ValueError("average exceeds best score")
        return self


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pose_id: str
    created_at: datetime
    duration_s: float
    hold_s: float
    avg_score: float
    best_score: float
    joint_scores: dict[str, float]


class DailyMinutes(BaseModel):
    date: str
    minutes: float


class PoseBest(BaseModel):
    pose_id: str
    best_score: float
    sessions: int


class Stats(BaseModel):
    total_sessions: int
    total_minutes: float
    total_hold_minutes: float
    current_streak_days: int
    daily: list[DailyMinutes]
    per_pose: list[PoseBest]
    weekly_goal: "WeeklyGoal"


# ---------------------------------------------------------------- accounts

Level = Literal["beginner", "intermediate", "advanced"]
_COMMON_PASSWORDS = frozenset(
    {
        "password123",
        "password1234",
        "1234567890",
        "qwertyuiop",
        "iloveyou12",
        "letmein123",
        "welcome123",
        "yogayogayoga",
        "abcdefghij",
        "1q2w3e4r5t",
        "qwerty1234",
        "passw0rd123",
    }
)


class SignUpIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=10, max_length=128)
    display_name: str | None = Field(default=None, max_length=60)

    @field_validator("email")
    @classmethod
    def valid_email(cls, v: str) -> str:
        from email_validator import EmailNotValidError, validate_email

        try:
            # Syntax only: no DNS lookups during sign-up
            return validate_email(v.strip(), check_deliverability=False).normalized.lower()
        except EmailNotValidError as exc:
            raise ValueError("invalid email") from exc

    @field_validator("display_name")
    @classmethod
    def clean_name(cls, v: str | None) -> str | None:
        v = " ".join(v.split()) if v else None
        return v or None

    @model_validator(mode="after")
    def strong_enough(self) -> "SignUpIn":
        lowered = self.password.lower()
        if lowered in _COMMON_PASSWORDS or lowered == self.email or len(set(self.password)) < 4:
            raise ValueError("password too weak")
        return self


class LoginIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalise(cls, v: str) -> str:
        return v.strip().lower()


class GoogleIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    credential: str = Field(min_length=20, max_length=4096)


class ProfileIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, max_length=60)
    experience_level: Level | None = None
    weekly_goal_days: int | None = Field(default=None, ge=1, le=7)

    @field_validator("display_name")
    @classmethod
    def clean_name(cls, v: str | None) -> str | None:
        return " ".join(v.split()) if v else v


class MeOut(BaseModel):
    authenticated: bool
    is_guest: bool
    email: str | None = None
    display_name: str | None = None
    experience_level: Level = "beginner"
    weekly_goal_days: int = 3
    has_password: bool = False
    has_google: bool = False
    created_at: datetime | None = None


class PublicConfig(BaseModel):
    google_client_id: str | None


# ---------------------------------------------------------------- insights


class WeeklyGoal(BaseModel):
    goal_days: int
    days_done: int
    week_start: str


class HistoryPoint(BaseModel):
    created_at: datetime
    avg_score: float
    best_score: float
    hold_s: float


class JointAverage(BaseModel):
    joint: str
    score: float


class PoseHistory(BaseModel):
    pose_id: str
    sessions: list[HistoryPoint]
    joints: list[JointAverage]  # weakest first


class Recommendation(BaseModel):
    pose_id: str
    reason: str
    kind: Literal["new", "weak_joint", "stale", "improve"]
