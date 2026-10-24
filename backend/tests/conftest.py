import os

os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["ALLOWED_ORIGINS"] = "http://testserver"
os.environ["STATIC_DIR"] = "/nonexistent"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.security import limiter  # noqa: E402

ORIGIN = {"Origin": "http://testserver"}


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    limiter.reset()
    with TestClient(app) as c:
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
