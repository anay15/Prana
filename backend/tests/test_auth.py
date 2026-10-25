from sqlalchemy import select

from app.auth import GUEST_COOKIE, SESSION_COOKIE
from app.db import SessionLocal
from app.models import AuthSession, User

from .conftest import ORIGIN

PASSWORD = "lotus-flow-2026"


def test_signup_creates_account_and_session(client, signup):
    r = signup()
    assert r.status_code == 201
    me = r.json()
    assert me["authenticated"] and me["email"] == "asha@example.com" and me["display_name"] == "Asha"
    cookie = r.headers["set-cookie"]
    assert SESSION_COOKIE in cookie and "HttpOnly" in cookie and "path=/api" in cookie.lower()
    assert client.get("/api/me").json()["email"] == "asha@example.com"

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "asha@example.com"))
        assert user.password_hash.startswith("$argon2id$")  # never stored in plain text
        token_hashes = [s.token_hash for s in db.scalars(select(AuthSession))]
    assert client.cookies.get(SESSION_COOKIE) not in token_hashes  # only the hash is stored


def test_signup_rejects_weak_passwords_and_bad_emails(client, signup):
    assert signup(password="short").status_code == 422
    assert signup(password="password123").status_code == 422
    assert signup(password="aaaaaaaaaaaa").status_code == 422
    assert signup(email="not-an-email").status_code == 422
    r = client.post(
        "/api/auth/signup", json={"email": "a@example.com", "password": PASSWORD, "admin": True}, headers=ORIGIN
    )
    assert r.status_code == 422


def test_duplicate_signup_conflicts(client, signup):
    assert signup().status_code == 201
    client.cookies.clear()
    assert signup(email="ASHA@example.com").status_code == 409


def test_login_logout_and_rotation(client, signup):
    signup()
    first = client.cookies.get(SESSION_COOKIE)
    r = client.post("/api/auth/login", json={"email": "Asha@Example.com", "password": PASSWORD}, headers=ORIGIN)
    assert r.status_code == 200
    second = client.cookies.get(SESSION_COOKIE)
    assert second and second != first  # session id rotates on sign-in

    # The old session token no longer works
    client.cookies.set(SESSION_COOKIE, first, path="/api")
    assert client.get("/api/me").json()["authenticated"] is False

    client.cookies.set(SESSION_COOKIE, second, path="/api")
    assert client.post("/api/auth/logout", headers=ORIGIN).status_code == 204
    client.cookies.set(SESSION_COOKIE, second, path="/api")
    assert client.get("/api/me").json()["authenticated"] is False  # invalidated server-side


def test_login_errors_are_generic(client, signup):
    signup()
    client.cookies.clear()
    wrong = client.post(
        "/api/auth/login", json={"email": "asha@example.com", "password": "nope-nope-nope"}, headers=ORIGIN
    )
    unknown = client.post(
        "/api/auth/login", json={"email": "who@example.com", "password": "nope-nope-nope"}, headers=ORIGIN
    )
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_login_is_rate_limited_per_email(client, signup):
    signup()
    client.cookies.clear()
    codes = [
        client.post(
            "/api/auth/login", json={"email": "asha@example.com", "password": f"wrong-{i}-xyz"}, headers=ORIGIN
        ).status_code
        for i in range(7)
    ]
    assert codes[:5] == [401] * 5
    assert 429 in codes[5:]


def test_guest_progress_merges_into_new_account(client, signup, session_body):
    client.post("/api/sessions", json=session_body, headers=ORIGIN)
    client.post("/api/sessions", json=session_body, headers=ORIGIN)
    assert client.cookies.get(GUEST_COOKIE)

    r = signup()
    assert r.status_code == 201
    assert GUEST_COOKIE in r.headers.get("set-cookie", "")  # guest cookie cleared
    client.cookies.delete(GUEST_COOKIE, path="/api")
    assert len(client.get("/api/sessions").json()) == 2

    with SessionLocal() as db:
        assert db.scalar(select(User).where(User.is_guest.is_(True))) is None


def test_guest_progress_merges_on_login(client, signup, session_body):
    signup()
    client.post("/api/auth/logout", headers=ORIGIN)
    client.cookies.clear()
    client.post("/api/sessions", json=session_body, headers=ORIGIN)  # practised as a guest
    client.post("/api/auth/login", json={"email": "asha@example.com", "password": PASSWORD}, headers=ORIGIN)
    client.cookies.delete(GUEST_COOKIE, path="/api")
    assert len(client.get("/api/sessions").json()) == 1


def test_accounts_are_isolated(client, signup, session_body):
    signup()
    client.post("/api/sessions", json=session_body, headers=ORIGIN)
    client.post("/api/auth/logout", headers=ORIGIN)
    client.cookies.clear()
    signup(email="ravi@example.com", name="Ravi")
    assert client.get("/api/sessions").json() == []
    assert client.get("/api/stats").json()["total_sessions"] == 0


def test_profile_update_and_validation(client, signup):
    assert client.patch("/api/me", json={"weekly_goal_days": 4}, headers=ORIGIN).status_code == 401  # guests can't
    signup()
    r = client.patch(
        "/api/me",
        json={"display_name": "  Asha   K ", "experience_level": "intermediate", "weekly_goal_days": 5},
        headers=ORIGIN,
    )
    assert r.status_code == 200
    assert r.json()["display_name"] == "Asha K"
    assert r.json()["weekly_goal_days"] == 5
    assert client.patch("/api/me", json={"weekly_goal_days": 9}, headers=ORIGIN).status_code == 422
    assert client.patch("/api/me", json={"email": "evil@example.com"}, headers=ORIGIN).status_code == 422


def test_delete_account_removes_everything(client, signup, session_body):
    signup()
    client.post("/api/sessions", json=session_body, headers=ORIGIN)
    assert client.delete("/api/me", headers=ORIGIN).status_code == 204
    assert client.get("/api/me").json()["authenticated"] is False
    with SessionLocal() as db:
        assert db.scalar(select(User)) is None
        assert db.scalar(select(AuthSession)) is None


def test_auth_endpoints_require_same_origin(client):
    r = client.post(
        "/api/auth/login", json={"email": "a@example.com", "password": "x"}, headers={"Origin": "https://evil.example"}
    )
    assert r.status_code == 403


def _google(monkeypatch, **claims):
    base = {
        "sub": "g-123",
        "email": "asha@example.com",
        "email_verified": True,
        "iss": "https://accounts.google.com",
        "given_name": "Asha",
    }
    base.update(claims)
    monkeypatch.setattr("google.oauth2.id_token.verify_oauth2_token", lambda token, req, aud: base)


def test_google_sign_in_creates_account(client, monkeypatch):
    _google(monkeypatch)
    r = client.post("/api/auth/google", json={"credential": "x" * 40}, headers=ORIGIN)
    assert r.status_code == 200
    assert r.json()["has_google"] and r.json()["display_name"] == "Asha"


def test_google_rejects_unverified_email(client, monkeypatch):
    _google(monkeypatch, email_verified=False)
    assert client.post("/api/auth/google", json={"credential": "x" * 40}, headers=ORIGIN).status_code == 401


def test_google_rejects_invalid_token(client, monkeypatch):
    def bad(*a):
        raise ValueError("bad signature")

    monkeypatch.setattr("google.oauth2.id_token.verify_oauth2_token", bad)
    assert client.post("/api/auth/google", json={"credential": "x" * 40}, headers=ORIGIN).status_code == 401


def test_google_link_revokes_preregistered_password(client, signup, monkeypatch):
    # Attacker pre-registers the victim's email with a password...
    signup()
    attacker_cookie = client.cookies.get(SESSION_COOKIE)
    client.cookies.clear()
    # ...then the real owner signs in with Google.
    _google(monkeypatch)
    assert client.post("/api/auth/google", json={"credential": "x" * 40}, headers=ORIGIN).status_code == 200

    # The attacker's session and password no longer work.
    client.cookies.clear()
    client.cookies.set(SESSION_COOKIE, attacker_cookie, path="/api")
    assert client.get("/api/me").json()["authenticated"] is False
    r = client.post("/api/auth/login", json={"email": "asha@example.com", "password": PASSWORD}, headers=ORIGIN)
    assert r.status_code == 401


def test_public_config_exposes_only_client_id(client):
    assert client.get("/api/config").json() == {"google_client_id": "test-client.apps.googleusercontent.com"}
