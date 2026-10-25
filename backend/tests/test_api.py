from app.auth import GUEST_COOKIE as COOKIE_NAME
from app.poses import JOINTS, POSES

from .conftest import ORIGIN


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_poses_are_well_formed(client):
    poses = client.get("/api/poses").json()
    assert len(poses) == len(POSES) >= 8
    for pose in poses:
        assert pose["targets"], pose["id"]
        assert 0.2 < pose["space"]["w"] < 2 and 0.2 < pose["space"]["h"] < 2, pose["id"]
        for t in pose["targets"]:
            assert t["joint"] in JOINTS
            assert 0 <= t["angle"] <= 180
            assert t["tolerance"] > 0


def test_security_headers(client):
    h = client.get("/api/health").headers
    assert "default-src 'self'" in h["content-security-policy"]
    assert h["x-content-type-options"] == "nosniff"
    assert h["x-frame-options"] == "DENY"
    assert h["cache-control"] == "no-store"


def test_anonymous_reads_are_empty(client):
    assert client.get("/api/sessions").json() == []
    stats = client.get("/api/stats").json()
    assert stats["total_sessions"] == 0
    assert len(stats["daily"]) == 14


def test_save_session_issues_httponly_cookie(client, session_body):
    r = client.post("/api/sessions", json=session_body, headers=ORIGIN)
    assert r.status_code == 201
    assert r.json()["joint_scores"]["right_knee"] == 91.2
    cookie = r.headers["set-cookie"]
    assert COOKIE_NAME in cookie and "HttpOnly" in cookie and "samesite=lax" in cookie.lower()

    sessions = client.get("/api/sessions").json()
    assert len(sessions) == 1
    stats = client.get("/api/stats").json()
    assert stats["total_sessions"] == 1
    assert stats["current_streak_days"] == 1
    assert stats["per_pose"][0] == {"pose_id": "tadasana", "best_score": 93.1, "sessions": 1}


def test_users_cannot_see_each_others_sessions(client, session_body):
    client.post("/api/sessions", json=session_body, headers=ORIGIN)
    client.cookies.clear()
    assert client.get("/api/sessions").json() == []
    client.cookies.set(COOKIE_NAME, "forged-token", path="/api")
    assert client.get("/api/sessions").json() == []


def test_csrf_requires_allowed_origin(client, session_body):
    assert client.post("/api/sessions", json=session_body).status_code == 403
    bad = {"Origin": "https://evil.example"}
    assert client.post("/api/sessions", json=session_body, headers=bad).status_code == 403


def test_csrf_requires_json(client):
    # A body that isn't JSON is rejected even from an allowed origin
    r = client.post(
        "/api/sessions",
        content="pose_id=tadasana",
        headers={**ORIGIN, "Content-Type": "application/x-www-form-urlencoded"},
    )
    assert r.status_code == 415


def test_validation_rejects_bad_input(client, session_body):
    cases = [
        {**session_body, "pose_id": "../../etc"},
        {**session_body, "avg_score": 101},
        {**session_body, "duration_s": -1},
        {**session_body, "hold_s": 999},
        {**session_body, "joint_scores": {"neck": 50}},
        {**session_body, "is_admin": True},
    ]
    for body in cases:
        r = client.post("/api/sessions", json=body, headers=ORIGIN)
        assert r.status_code == 422, body
        assert "../../etc" not in r.text


def test_delete_my_data(client, session_body):
    client.post("/api/sessions", json=session_body, headers=ORIGIN)
    assert client.delete("/api/sessions", headers=ORIGIN).status_code == 204
    assert client.get("/api/sessions").json() == []


def test_rate_limit(client, session_body):
    codes = [client.post("/api/sessions", json=session_body, headers=ORIGIN).status_code for _ in range(32)]
    assert codes.count(201) == 30
    assert codes[-1] == 429


def test_client_ip_ignores_spoofed_forwarded_for():
    from starlette.requests import Request

    from app import security

    def req(xff: str | None) -> Request:
        headers = [(b"x-forwarded-for", xff.encode())] if xff else []
        return Request({"type": "http", "headers": headers, "client": ("10.0.0.9", 1234)})

    # No trusted proxies: forwarded headers are ignored entirely.
    assert security.client_ip(req("1.2.3.4")) == "10.0.0.9"

    object.__setattr__(security.settings, "trusted_proxy_hops", 1)
    try:
        # Attacker sends "6.6.6.6"; the proxy appends the real address last.
        assert security.client_ip(req("6.6.6.6, 203.0.113.7")) == "203.0.113.7"
        assert security.client_ip(req(None)) == "10.0.0.9"

        # Render: client, Cloudflare edge, internal load balancer.
        object.__setattr__(security.settings, "trusted_proxy_hops", 3)
        chain = "6.6.6.6, 203.0.113.7, 172.71.0.1, 10.24.0.1"
        assert security.client_ip(req(chain)) == "203.0.113.7"
    finally:
        object.__setattr__(security.settings, "trusted_proxy_hops", 0)
