from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import auth
from .config import settings
from .db import get_db
from .models import PracticeSession, User
from .schemas import GoogleIn, LoginIn, MeOut, ProfileIn, PublicConfig, SignUpIn
from .security import hit_limit, limiter, require_same_origin

router = APIRouter(prefix="/api", dependencies=[Depends(require_same_origin)])

_BAD_LOGIN = "Incorrect email or password"


def me_out(user: User | None) -> MeOut:
    if user is None or user.is_guest:
        return MeOut(authenticated=False, is_guest=user is not None)
    return MeOut(
        authenticated=True,
        is_guest=False,
        email=user.email,
        display_name=user.display_name,
        experience_level=user.experience_level,  # type: ignore[arg-type]
        weekly_goal_days=user.weekly_goal_days,
        has_password=bool(user.password_hash),
        has_google=bool(user.google_sub),
        created_at=user.created_at,
    )


@router.get("/config", response_model=PublicConfig)
@limiter.limit("120/minute")
def public_config(request: Request, response: Response) -> PublicConfig:
    return PublicConfig(google_client_id=settings.google_client_id or None)


@router.post("/auth/signup", response_model=MeOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def sign_up(request: Request, response: Response, body: SignUpIn, db: Session = Depends(get_db)) -> MeOut:
    if db.scalar(select(User.id).where(User.email == body.email)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists. Try signing in.")
    user = User(
        is_guest=False,
        email=body.email,
        password_hash=auth.hash_password(body.password),
        display_name=body.display_name,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:  # lost a race with a concurrent sign-up
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "An account with this email already exists. Try signing in."
        ) from None
    auth.start_session(db, request, response, user)
    return me_out(user)


@router.post("/auth/login", response_model=MeOut)
@limiter.limit("10/minute")
def log_in(request: Request, response: Response, body: LoginIn, db: Session = Depends(get_db)) -> MeOut:
    hit_limit("5/minute", "login-email", body.email)  # slows password guessing against one account
    user = db.scalar(select(User).where(User.email == body.email, User.is_guest.is_(False)))
    if not auth.verify_password(user, body.password) or user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, _BAD_LOGIN)
    auth.maybe_rehash(db, user, body.password)
    auth.start_session(db, request, response, user)
    return me_out(user)


@router.post("/auth/google", response_model=MeOut)
@limiter.limit("10/minute")
def google_sign_in(request: Request, response: Response, body: GoogleIn, db: Session = Depends(get_db)) -> MeOut:
    try:
        claims = auth.verify_google_credential(body.credential)
    except auth.GoogleTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google sign-in failed") from None
    user = auth.user_for_google(db, claims)
    auth.start_session(db, request, response, user)
    return me_out(user)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def log_out(request: Request, response: Response, db: Session = Depends(get_db)) -> None:
    auth.end_session(db, request, response)


@router.get("/me", response_model=MeOut)
@limiter.limit("120/minute")
def get_me(request: Request, response: Response, user: User | None = Depends(auth.current_user)) -> MeOut:
    return me_out(user)


@router.patch("/me", response_model=MeOut)
@limiter.limit("30/minute")
def update_me(
    request: Request,
    response: Response,
    body: ProfileIn,
    user: User = Depends(auth.require_account),
    db: Session = Depends(get_db),
) -> MeOut:
    changes = body.model_dump(exclude_unset=True)
    if "display_name" in changes:
        user.display_name = changes["display_name"] or None
    if changes.get("experience_level") is not None:
        user.experience_level = changes["experience_level"]
    if changes.get("weekly_goal_days") is not None:
        user.weekly_goal_days = changes["weekly_goal_days"]
    db.commit()
    return me_out(user)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
def delete_account(
    request: Request,
    response: Response,
    user: User = Depends(auth.require_account),
    db: Session = Depends(get_db),
) -> None:
    """Permanently delete the account, its sessions and all practice history."""
    db.execute(delete(PracticeSession).where(PracticeSession.user_id == user.id))
    auth.revoke_all_sessions(db, user)
    db.delete(user)
    db.commit()
    auth.end_session(db, request, response)
