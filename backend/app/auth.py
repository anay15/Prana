"""Identity: anonymous guests, password and Google accounts, login sessions.

Two cookies, both HttpOnly, SameSite=Lax and scoped to /api:
  prana_id       long-lived guest token (progress before signing up)
  prana_session  login session for an account (rotated on every sign-in)
Only SHA-256 hashes of either token are stored server-side.
"""

import logging
import secrets
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import AuthSession, PracticeSession, User
from .security import hash_token

log = logging.getLogger("prana.auth")

GUEST_COOKIE = "prana_id"
SESSION_COOKIE = "prana_session"
GUEST_MAX_AGE = 60 * 60 * 24 * 365
_TOKEN_BYTES = 32
_MAX_TOKEN_LEN = 128

# Argon2id with the library's current recommended parameters (RFC 9106 low-memory profile)
_hasher = PasswordHasher()
# Verified against when the email is unknown, so response time doesn't reveal which emails exist
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(16))


def _now() -> datetime:
    return datetime.now(UTC)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def _set_cookie(response: Response, name: str, value: str, max_age: int) -> None:
    response.set_cookie(
        name, value, max_age=max_age, httponly=True, secure=settings.is_production, samesite="lax", path="/api"
    )


def _clear_cookie(response: Response, name: str) -> None:
    response.delete_cookie(name, path="/api", secure=settings.is_production, httponly=True, samesite="lax")


# ---------------------------------------------------------------- passwords


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(user: User | None, password: str) -> bool:
    """Constant-work check: always runs one Argon2 verification."""
    stored = user.password_hash if user and user.password_hash else None
    try:
        _hasher.verify(stored or _DUMMY_HASH, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False
    return stored is not None


def maybe_rehash(db: Session, user: User, password: str) -> None:
    if user.password_hash and _hasher.check_needs_rehash(user.password_hash):
        user.password_hash = _hasher.hash(password)
        db.commit()


# ---------------------------------------------------------------- lookups


def _guest_from_cookie(db: Session, request: Request) -> User | None:
    token = request.cookies.get(GUEST_COOKIE)
    if not token or len(token) > _MAX_TOKEN_LEN:
        return None
    return db.scalar(select(User).where(User.token_hash == hash_token(token), User.is_guest.is_(True)))


def _account_from_cookie(db: Session, request: Request) -> User | None:
    token = request.cookies.get(SESSION_COOKIE)
    if not token or len(token) > _MAX_TOKEN_LEN:
        return None
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == hash_token(token)))
    if session is None:
        return None
    if _aware(session.expires_at) <= _now():
        db.delete(session)
        db.commit()
        return None
    return session.user


# ---------------------------------------------------------------- dependencies


def current_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    """The signed-in account, else the guest, else None (never saved anything)."""
    return _account_from_cookie(db, request) or _guest_from_cookie(db, request)


def current_or_new_user(request: Request, response: Response, db: Session = Depends(get_db)) -> User:
    """Resolve the caller, creating an anonymous guest on first write."""
    user = current_user(request, db)
    if user is not None:
        return user
    token = secrets.token_urlsafe(_TOKEN_BYTES)
    user = User(token_hash=hash_token(token), is_guest=True)
    db.add(user)
    db.commit()
    _set_cookie(response, GUEST_COOKIE, token, GUEST_MAX_AGE)
    return user


def require_account(user: User | None = Depends(current_user)) -> User:
    if user is None or user.is_guest:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in required")
    return user


# ---------------------------------------------------------------- sign-in plumbing


def start_session(db: Session, request: Request, response: Response, user: User) -> None:
    """Sign `user` in: revoke the browser's previous session (rotation), fold
    any guest progress into the account, then issue a fresh session cookie."""
    old = request.cookies.get(SESSION_COOKIE)
    if old and len(old) <= _MAX_TOKEN_LEN:
        db.execute(delete(AuthSession).where(AuthSession.token_hash == hash_token(old)))

    guest = _guest_from_cookie(db, request)
    if guest is not None and guest.id != user.id:
        moved = db.execute(
            update(PracticeSession).where(PracticeSession.user_id == guest.id).values(user_id=user.id)
        ).rowcount
        db.delete(guest)
        log.info("Merged %d guest sessions into account %d", moved, user.id)
    _clear_cookie(response, GUEST_COOKIE)

    # Opportunistic cleanup of this user's expired sessions
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id, AuthSession.expires_at <= _now()))

    token = secrets.token_urlsafe(_TOKEN_BYTES)
    db.add(
        AuthSession(
            user_id=user.id, token_hash=hash_token(token), expires_at=_now() + timedelta(days=settings.session_days)
        )
    )
    db.commit()
    _set_cookie(response, SESSION_COOKIE, token, settings.session_days * 24 * 60 * 60)


def end_session(db: Session, request: Request, response: Response) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token and len(token) <= _MAX_TOKEN_LEN:
        db.execute(delete(AuthSession).where(AuthSession.token_hash == hash_token(token)))
        db.commit()
    _clear_cookie(response, SESSION_COOKIE)


def revoke_all_sessions(db: Session, user: User) -> None:
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))


# ---------------------------------------------------------------- Google


class GoogleTokenError(Exception):
    pass


def verify_google_credential(credential: str) -> dict:
    """Verify a Google Identity Services ID token (signature, audience, issuer,
    expiry) and return its claims. Raises GoogleTokenError if invalid."""
    if not settings.google_client_id:
        raise GoogleTokenError("Google sign-in is not configured")
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    try:
        claims = id_token.verify_oauth2_token(credential, google_requests.Request(), settings.google_client_id)
    except ValueError as exc:
        raise GoogleTokenError("Invalid Google credential") from exc
    if claims.get("iss") not in {"accounts.google.com", "https://accounts.google.com"}:
        raise GoogleTokenError("Unexpected issuer")
    if not claims.get("email") or not claims.get("email_verified"):
        raise GoogleTokenError("Google account email is not verified")
    return claims


def user_for_google(db: Session, claims: dict) -> User:
    """Find or create the account for a verified Google identity."""
    sub = str(claims["sub"])
    email = str(claims["email"]).strip().lower()
    user = db.scalar(select(User).where(User.google_sub == sub))
    if user is not None:
        return user

    user = db.scalar(select(User).where(User.email == email, User.is_guest.is_(False)))
    if user is not None:
        # Link to an existing password account with the same email. Emails of
        # password accounts are never verified, so someone could have
        # pre-registered this address; Google has now proven ownership, so
        # drop that password and every existing session (anti pre-hijacking).
        user.google_sub = sub
        if user.password_hash:
            user.password_hash = None
            revoke_all_sessions(db, user)
            log.info("Linked Google to account %d and revoked its password", user.id)
        db.commit()
        return user

    name = str(claims.get("given_name") or claims.get("name") or "")[:60] or None
    user = User(is_guest=False, email=email, google_sub=sub, display_name=name)
    db.add(user)
    db.commit()
    return user
