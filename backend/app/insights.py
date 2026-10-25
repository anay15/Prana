"""Personal insights: per-pose history and what to practise next."""

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from statistics import mean

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import current_user
from .db import get_db
from .models import PracticeSession, User
from .poses import POSE_IDS, POSES
from .schemas import HistoryPoint, JointAverage, PoseHistory, Recommendation
from .security import limiter, require_same_origin

router = APIRouter(prefix="/api", dependencies=[Depends(require_same_origin)])

_LEVEL_RANK = {"beginner": 0, "intermediate": 1, "advanced": 2}
_RECENT = 5  # sessions considered "recent" when judging a pose


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def _joint_averages(sessions: list[PracticeSession]) -> list[JointAverage]:
    sums: dict[str, list[float]] = defaultdict(list)
    for s in sessions:
        for joint, score in (s.joint_scores or {}).items():
            sums[joint].append(score)
    averages = [JointAverage(joint=j, score=round(mean(v), 1)) for j, v in sums.items()]
    return sorted(averages, key=lambda a: a.score)


@router.get("/poses/{pose_id}/history", response_model=PoseHistory)
@limiter.limit("120/minute")
def pose_history(
    request: Request,
    response: Response,
    pose_id: str = Path(min_length=2, max_length=40),
    limit: int = Query(60, ge=1, le=200),
    user: User | None = Depends(current_user),
    db: Session = Depends(get_db),
) -> PoseHistory:
    if pose_id not in POSE_IDS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown pose")
    sessions: list[PracticeSession] = []
    if user is not None:
        stmt = (
            select(PracticeSession)
            .where(PracticeSession.user_id == user.id, PracticeSession.pose_id == pose_id)
            .order_by(PracticeSession.created_at.desc())
            .limit(limit)
        )
        sessions = list(db.scalars(stmt))[::-1]  # oldest first for charting
    return PoseHistory(
        pose_id=pose_id,
        sessions=[
            HistoryPoint(created_at=s.created_at, avg_score=s.avg_score, best_score=s.best_score, hold_s=s.hold_s)
            for s in sessions
        ],
        joints=_joint_averages(sessions[-_RECENT:]),
    )


def recommend(
    user: User | None, sessions: list[PracticeSession], now: datetime, count: int = 3
) -> list[Recommendation]:
    """Rank poses by how much practising them now would help.

    Practised poses score higher the weaker their recent alignment and the
    longer since they were last done; untried poses score by how well their
    difficulty matches the user's experience."""
    level = _LEVEL_RANK.get(user.experience_level if user and not user.is_guest else "beginner", 0)
    by_pose: dict[str, list[PracticeSession]] = defaultdict(list)
    for s in sorted(sessions, key=lambda s: _aware(s.created_at)):
        by_pose[s.pose_id].append(s)

    scored: list[tuple[float, Recommendation]] = []
    for pose in POSES:
        history = by_pose.get(pose["id"], [])
        name = pose["name"]
        if not history:
            gap = _LEVEL_RANK[pose["level"]] - level
            priority = 45 - 25 * max(gap, 0) - 5 * max(-gap, 0)
            if pose["level"] != "beginner" and len(sessions) < 3:
                priority -= 15  # build a base before harder poses
            reason = f"New for you: {name} is a great next step" if gap <= 0 else f"Ready for a challenge? Try {name}"
            scored.append((priority, Recommendation(pose_id=pose["id"], reason=reason, kind="new")))
            continue

        recent = history[-_RECENT:]
        recent_avg = mean(s.avg_score for s in recent[-3:])
        days_since = (now - _aware(history[-1].created_at)).days
        weakest = _joint_averages(recent)
        priority = (100 - recent_avg) * 0.6 + min(days_since, 14) * 2.5

        if weakest and weakest[0].score < 70:
            joint = weakest[0].joint.replace("_", " ")
            rec = Recommendation(
                pose_id=pose["id"],
                reason=f"Your {joint} averages {round(weakest[0].score)} in {name}. Let's work on it",
                kind="weak_joint",
            )
            priority += 15 + (70 - weakest[0].score) * 0.5  # the weaker the joint, the more urgent
        elif days_since >= 5:
            rec = Recommendation(
                pose_id=pose["id"], reason=f"You haven't done {name} in {days_since} days", kind="stale"
            )
        else:
            best = max(s.best_score for s in history)
            rec = Recommendation(
                pose_id=pose["id"], reason=f"Beat your best of {round(best)} in {name}", kind="improve"
            )
        scored.append((priority, rec))

    scored.sort(key=lambda item: -item[0])
    return [rec for _, rec in scored[:count]]


@router.get("/recommendations", response_model=list[Recommendation])
@limiter.limit("120/minute")
def recommendations(
    request: Request,
    response: Response,
    user: User | None = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[Recommendation]:
    now = datetime.now(UTC)
    sessions: list[PracticeSession] = []
    if user is not None:
        stmt = select(PracticeSession).where(
            PracticeSession.user_id == user.id, PracticeSession.created_at >= now - timedelta(days=90)
        )
        sessions = list(db.scalars(stmt))
    return recommend(user, sessions, now)
