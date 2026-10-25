import os

os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")  # CI/local may point this at Postgres
os.environ["ALLOWED_ORIGINS"] = "http://testserver"
os.environ["STATIC_DIR"] = "/nonexistent"
os.environ["GOOGLE_CLIENT_ID"] = "test-client.apps.googleusercontent.com"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.security import limiter  # noqa: E402

ORIGIN = {"Origin": "http://testserver"}


def _reset_database() -> None:
    # Start every test from an empty database built by the real migrations
    Base.metadata.drop_all(engine)
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS alembic_version"))


@pytest.fixture()
def client():
    _reset_database()
    limiter.reset()
    with TestClient(app) as c:  # app startup runs the migrations
        yield c


@pytest.fixture()
def session_body():
    return {
        "pose_id": "tadasana",
        "duration_s": 42.5,
        "hold_s": 20,
        "avg_score": 78.3,
        "best_score": 93.1,
        "joint_scores": {"left_knee": 95, "right_knee": 91.24},
    }


@pytest.fixture()
def signup(client):
    def _signup(email="asha@example.com", password="lotus-flow-2026", name="Asha"):
        return client.post(
            "/api/auth/signup", json={"email": email, "password": password, "display_name": name}, headers=ORIGIN
        )

    return _signup
