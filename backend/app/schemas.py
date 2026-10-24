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
