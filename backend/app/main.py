import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import models  # noqa: F401  (register tables)
from .api import router
from .config import settings
from .db import Base, engine
from .security import SecurityHeadersMiddleware, limiter

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("prana")


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    log.info("Prana API started (env=%s)", settings.env)
    yield


app = FastAPI(
    title="Prana API",
    version="1.0.0",
    description="Pose library and practice history for the Prana AI yoga coach.",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)
app.state.limiter = limiter
app.add_middleware(SecurityHeadersMiddleware)
app.include_router(router)


@app.exception_handler(RateLimitExceeded)
async def rate_limited(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    response = JSONResponse({"detail": "Too many requests"}, status_code=429)
    return request.app.state.limiter._inject_headers(response, request.state.view_rate_limit)


@app.exception_handler(RequestValidationError)
async def invalid_request(request: Request, exc: RequestValidationError) -> JSONResponse:
    # Field locations only; never echo submitted values back.
    fields = sorted({".".join(str(p) for p in e["loc"][1:]) for e in exc.errors()})
    return JSONResponse({"detail": "Invalid request", "fields": fields}, status_code=422)


@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    return JSONResponse(
        {"detail": exc.detail if exc.status_code < 500 else "Server error"}, status_code=exc.status_code
    )


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception) -> JSONResponse:
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse({"detail": "Server error"}, status_code=500)


class SPAStaticFiles(StaticFiles):
    """Serve the built frontend; unknown paths fall back to index.html so
    client-side routes like /practice/tadasana work on refresh."""

    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except (HTTPException, StarletteHTTPException) as exc:
            if exc.status_code != 404 or path.startswith("api/"):
                raise
            return await super().get_response("index.html", scope)


if settings.static_dir.is_dir():
    app.mount("/", SPAStaticFiles(directory=settings.static_dir, html=True), name="frontend")
else:
    log.warning("Frontend build not found at %s; serving API only", settings.static_dir)
