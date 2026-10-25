"""CSRF protection, security headers, client IPs and rate limiting."""

import hashlib
from urllib.parse import urlsplit

from fastapi import HTTPException, Request, status
from limits import parse
from slowapi import Limiter
from starlette.middleware.base import BaseHTTPMiddleware

from .config import settings

_IDENTITY_COOKIES = ("prana_session", "prana_id")
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
    for name in _IDENTITY_COOKIES:
        if token := request.cookies.get(name):
            return f"id:{hash_token(token)}"
    return f"ip:{client_ip(request)}"


limiter = Limiter(
    key_func=client_ip,
    storage_uri=settings.rate_limit_storage,
    default_limits=["300/minute"],
    headers_enabled=True,
)
identity_limit = limiter.shared_limit("60/minute", scope="identity", key_func=_identity_key)


def hit_limit(limit: str, scope: str, key: str) -> None:
    """Rate-limit on a value only known inside the handler (e.g. the email
    being signed in to). Raises 429 once the limit is exceeded."""
    if not limiter.limiter.hit(parse(limit), scope, hash_token(key)):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests")


def _origin_of(request: Request) -> str | None:
    if origin := request.headers.get("origin"):
        return origin.rstrip("/")
    if referer := request.headers.get("referer"):
        parts = urlsplit(referer)
        return f"{parts.scheme}://{parts.netloc}"
    return None


def require_same_origin(request: Request) -> None:
    """CSRF defence for state-changing requests: Origin must be allow-listed
    and any body must be JSON (which forces a CORS preflight cross-site)."""
    if request.method not in _UNSAFE_METHODS:
        return
    if _origin_of(request) not in settings.allowed_origins:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Forbidden")
    has_body = request.headers.get("content-length", "0") != "0" or "transfer-encoding" in request.headers
    if has_body and not request.headers.get("content-type", "").startswith("application/json"):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Expected application/json")


# MediaPipe compiles its WebAssembly runtime at load, hence 'wasm-unsafe-eval'.
# Scripts, model weights and wasm are served from our own origin; the only
# third party is Google Identity Services for "Sign in with Google".
_GSI = "https://accounts.google.com/gsi/"
_CSP = "; ".join(
    [
        "default-src 'self'",
        f"script-src 'self' 'wasm-unsafe-eval' {_GSI}client",
        "worker-src 'self' blob:",
        f"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com {_GSI}style",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        "media-src 'self' blob:",
        f"connect-src 'self' {_GSI}",
        f"frame-src {_GSI}",
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
        # Google's sign-in popup needs to post back to this window
        h["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups"
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
