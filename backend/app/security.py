"""Anonymous identity, CSRF protection, security headers and rate limiting."""

import hashlib
import secrets
from urllib.parse import urlsplit

from fastapi import Depends, HTTPException, Request, Response, status
from slowapi import Limiter
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware

from .config import settings
from .db import get_db
from .models import User

COOKIE_NAME = "prana_id"
COOKIE_MAX_AGE = 60 * 60 * 24 * 365
_TOKEN_BYTES = 32
_UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def hash_token(token: str) -> str:
    # Tokens are 256-bit random values, so a fast hash is sufficient (no
    # password-style stretching needed); only the hash is ever stored.
    return hashlib.sha256(token.encode()).hexdigest()


def client_ip(request: Request) -> str:
    """The caller's IP for rate limiting.

    Clients can put anything in X-Forwarded-For, so only the entries appended
    by our own proxies are trusted: with N trusted hops, the client is the
    N-th address from the right."""
    hops = settings.trusted_proxy_hops
    forwarded = request.headers.get("x-forwarded-for", "")
    if hops > 0 and forwarded:
        chain = [part.strip() for part in forwarded.split(",") if part.strip()]
        if len(chain) >= hops:
            return chain[-hops][:64]
    return request.client.host if request.client else "unknown"


def _identity_key(request: Request) -> str:
    token = request.cookies.get(COOKIE_NAME)
    return f"id:{hash_token(token)}" if token else f"ip:{client_ip(request)}"


limiter = Limiter(
    key_func=client_ip,
    storage_uri=settings.rate_limit_storage,
    default_limits=["300/minute"],
    headers_enabled=True,
)
identity_limit = limiter.shared_limit("60/minute", scope="identity", key_func=_identity_key)


def _lookup(db: Session, token: str | None) -> User | None:
    if not token or len(token) > 128:
        return None
    return db.scalar(select(User).where(User.token_hash == hash_token(token)))


def current_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    """The caller's user record, or None if they have never saved anything."""
    return _lookup(db, request.cookies.get(COOKIE_NAME))


def current_or_new_user(request: Request, response: Response, db: Session = Depends(get_db)) -> User:
    """Resolve the caller, creating an anonymous identity on first write."""
    user = _lookup(db, request.cookies.get(COOKIE_NAME))
    if user is not None:
        return user
    token = secrets.token_urlsafe(_TOKEN_BYTES)
    user = User(token_hash=hash_token(token))
    db.add(user)
    db.commit()
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        path="/api",
    )
    return user


def _origin_of(request: Request) -> str | None:
    if origin := request.headers.get("origin"):
        return origin.rstrip("/")
    if referer := request.headers.get("referer"):
        parts = urlsplit(referer)
        return f"{parts.scheme}://{parts.netloc}"
    return None


def require_same_origin(request: Request) -> None:
    """CSRF defence for state-changing requests: Origin must be allow-listed
    and the body must be JSON (which forces a CORS preflight cross-site)."""
    if request.method not in _UNSAFE_METHODS:
        return
    if _origin_of(request) not in settings.allowed_origins:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Forbidden")
    if request.method != "DELETE" and not request.headers.get("content-type", "").startswith("application/json"):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Expected application/json")


# MediaPipe compiles its WebAssembly runtime at load, hence 'wasm-unsafe-eval'.
# Everything (scripts, model weights, wasm) is served from our own origin.
_CSP = "; ".join(
    [
        "default-src 'self'",
        "script-src 'self' 'wasm-unsafe-eval'",
        "worker-src 'self' blob:",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        "media-src 'self' blob:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ]
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        h = response.headers
        h.setdefault("Content-Security-Policy", _CSP)
        h["X-Content-Type-Options"] = "nosniff"
        h["X-Frame-Options"] = "DENY"
        h["Referrer-Policy"] = "strict-origin-when-cross-origin"
        h["Permissions-Policy"] = "camera=(self), microphone=(), geolocation=(), payment=()"
        h["Cross-Origin-Opener-Policy"] = "same-origin"
        if settings.is_production:
            h["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        path = request.url.path
        if path.startswith("/api/"):
            h["Cache-Control"] = "no-store"
        elif path.startswith(("/assets/", "/models/", "/mediapipe/")):
            h["Cache-Control"] = "public, max-age=31536000, immutable"
        elif response.headers.get("content-type", "").startswith("text/html"):
            h["Cache-Control"] = "no-cache"
        return response
