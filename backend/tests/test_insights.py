from datetime import UTC, datetime, timedelta

from app.insights import recommend
from app.models import PracticeSession, User

from .conftest import ORIGIN


def _session(pose, days_ago, avg, joints=None, now=None):
    now = now or datetime.now(UTC)
    return PracticeSession(
        pose_id=pose,
        created_at=now - timedelta(days=days_ago),
        duration_s=30,
        hold_s=20,
        avg_score=avg,
        best_score=min(100, avg + 5),
        joint_scores=joints or {},
    )


def test_weekly_goal_in_stats(client, signup, session_body):
    signup()
    client.patch("/api/me", json={"weekly_goal_days": 4}, headers=ORIGIN)
    client.post("/api/sessions", json=session_body, headers=ORIGIN)
    goal = client.get("/api/stats").json()["weekly_goal"]
    assert goal["goal_days"] == 4 and goal["days_done"] == 1


def test_pose_history_and_weakest_joint(client, session_body):
    weak = {**session_body, "joint_scores": {"left_knee": 40, "right_knee": 95}}
    client.post("/api/sessions", json=session_body, headers=ORIGIN)
    client.post("/api/sessions", json=weak, headers=ORIGIN)
    h = client.get("/api/poses/tadasana/history").json()
    assert len(h["sessions"]) == 2
    assert h["joints"][0]["joint"] == "left_knee"  # weakest first
    assert client.get("/api/poses/../etc/history").status_code == 404
    assert client.get("/api/poses/nope/history").status_code == 404


def test_history_is_private(client, signup, session_body):
    signup()
    client.post("/api/sessions", json=session_body, headers=ORIGIN)
    client.post("/api/auth/logout", headers=ORIGIN)
    client.cookies.clear()
    assert client.get("/api/poses/tadasana/history").json()["sessions"] == []


def test_new_user_gets_beginner_poses():
    recs = recommend(None, [], datetime.now(UTC))
    assert len(recs) == 3
    assert all(r.kind == "new" for r in recs)
    assert {"virabhadrasana_ii", "trikonasana", "vrksasana"}.isdisjoint({r.pose_id for r in recs})


def test_weak_joint_is_prioritised():
    now = datetime.now(UTC)
    sessions = [_session("phalakasana", 1, 60, {"left_hip": 35, "left_elbow": 90}, now)]
    recs = recommend(None, sessions, now)
    assert recs[0].pose_id == "phalakasana"
    assert recs[0].kind == "weak_joint" and "left hip" in recs[0].reason


def test_stale_pose_is_suggested():
    now = datetime.now(UTC)
    # Every pose practised well, one of them long ago
    sessions = [_session(p, 0, 95, now=now) for p in ("tadasana", "utkatasana", "balasana", "phalakasana")]
    sessions += [_session(p, 0, 95, now=now) for p in ("vrksasana", "virabhadrasana_ii", "trikonasana")]
    sessions.append(_session("adho_mukha_svanasana", 12, 90, now=now))
    recs = recommend(User(is_guest=False, experience_level="intermediate"), sessions, now)
    assert recs[0].pose_id == "adho_mukha_svanasana" and recs[0].kind == "stale"


def test_recommendations_endpoint(client):
    r = client.get("/api/recommendations")
    assert r.status_code == 200 and len(r.json()) == 3
