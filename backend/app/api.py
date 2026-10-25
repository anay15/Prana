from collections import defaultdict
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .auth import GUEST_COOKIE, current_or_new_user, current_user
from .db import get_db
from .models import PracticeSession, User
from .poses import POSES
from .schemas import DailyMinutes, PoseBest, SessionIn, SessionOut, Stats
from .security import identity_limit, limiter, require_same_origin

router = APIRouter(prefix="/api", dependencies=[Depends(require_same_origin)])

TzOffset = Query(0, ge=-840, le=840, description="Client UTC offset in minutes (e.g. 330 for IST)")


@router.get("/health", include_in_schema=False)
def health() -> dict:
    return {"status": "ok"}


@router.get("/poses")
@limiter.limit("120/minute")
def list_poses(request: Request, response: Response) -> list[dict]:
    return POSES


@router.post("/sessions", status_code=status.HTTP_201_CREATED, response_model=SessionOut)
@limiter.limit("30/minute")
@identity_limit
def create_session(
    request: Request,
    response: Response,
    body: SessionIn,
    user: User = Depends(current_or_new_user),
    db: Session = Depends(get_db),
) -> PracticeSession:
    record = PracticeSession(
        user_id=user.id,
        pose_id=body.pose_id,
        duration_s=round(body.duration_s, 1),
        hold_s=round(body.hold_s, 1),
        avg_score=round(body.avg_score, 1),
        best_score=round(body.best_score, 1),
        joint_scores=body.joint_scores,
    )
    db.add(record)
    db.commit()
    return record


@router.get("/sessions", response_model=list[SessionOut])
@limiter.limit("120/minute")
def list_sessions(
    request: Request,
    response: Response,
    limit: int = Query(50, ge=1, le=200),
    user: User | None = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[PracticeSession]:
    if user is None:
        return []
    stmt = (
        select(PracticeSession)
        .where(PracticeSession.user_id == user.id)
        .order_by(PracticeSession.created_at.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt))


@router.delete("/sessions", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
def delete_my_data(
    request: Request,
    response: Response,
    user: User | None = Depends(current_user),
    db: Session = Depends(get_db),
) -> None:
    """Delete the caller's practice history. Guests are forgotten entirely;
    accounts keep their login (use DELETE /api/me to remove the account)."""
    if user is not None:
        db.execute(delete(PracticeSession).where(PracticeSession.user_id == user.id))
        if user.is_guest:
            db.delete(user)
            response.delete_cookie(GUEST_COOKIE, path="/api")
        db.commit()


@router.get("/stats", response_model=Stats)
@limiter.limit("120/minute")
def stats(
    request: Request,
    response: Response,
    tz_offset: int = TzOffset,
    user: User | None = Depends(current_user),
    db: Session = Depends(get_db),
) -> Stats:
    offset = timedelta(minutes=tz_offset)
    today = (datetime.now(UTC) + offset).date()
    sessions: list[PracticeSession] = []
    if user is not None:
        since = datetime.now(UTC) - timedelta(days=366)
        sessions = list(
            db.scalars(
                select(PracticeSession).where(PracticeSession.user_id == user.id, PracticeSession.created_at >= since)
            )
        )

    minutes_by_day: dict = defaultdict(float)
    per_pose: dict[str, PoseBest] = {}
    for s in sessions:
        created = s.created_at if s.created_at.tzinfo else s.created_at.replace(tzinfo=UTC)
        minutes_by_day[(created + offset).date()] += s.duration_s / 60
        best = per_pose.get(s.pose_id)
        if best is None:
            per_pose[s.pose_id] = PoseBest(pose_id=s.pose_id, best_score=s.best_score, sessions=1)
        else:
            best.best_score = max(best.best_score, s.best_score)
            best.sessions += 1

    streak = 0
    day = today if today in minutes_by_day else today - timedelta(days=1)
    while day in minutes_by_day:
        streak += 1
        day -= timedelta(days=1)

    daily = [
        DailyMinutes(
            date=(today - timedelta(days=i)).isoformat(),
            minutes=round(minutes_by_day.get(today - timedelta(days=i), 0), 1),
        )
        for i in range(13, -1, -1)
    ]
    return Stats(
        total_sessions=len(sessions),
        total_minutes=round(sum(s.duration_s for s in sessions) / 60, 1),
        total_hold_minutes=round(sum(s.hold_s for s in sessions) / 60, 1),
        current_streak_days=streak,
        daily=daily,
        per_pose=sorted(per_pose.values(), key=lambda p: -p.sessions),
    )
