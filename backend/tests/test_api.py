VALID_CONTACT = {
    "name": "CI Pipeline",
    "email": "ci@example.com",
    "subject": "Kiểm tra tự động",
    "message": "Tin nhắn được tạo bởi pytest trong GitLab CI.",
}


def test_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"


def test_profile_is_seeded(client):
    res = client.get("/api/profile")
    assert res.status_code == 200
    assert res.json()["name"] == "Nguyễn Hữu Hải"


def test_projects_featured_first(client):
    projects = client.get("/api/projects").json()
    assert len(projects) >= 1
    flags = [p["featured"] for p in projects]
    assert flags == sorted(flags, reverse=True)


def test_create_contact(client):
    res = client.post("/api/contact", json=VALID_CONTACT)
    assert res.status_code == 201
    body = res.json()
    assert body["id"] > 0
    assert body["subject"] == VALID_CONTACT["subject"]


def test_contact_validation(client):
    res = client.post("/api/contact", json={"name": "a", "email": "not-an-email", "subject": "x", "message": "short"})
    assert res.status_code == 422
    fields = {err["loc"][-1] for err in res.json()["detail"]}
    assert {"name", "email", "subject", "message"} <= fields


def test_protected_endpoints_require_token(client):
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/admin/messages").status_code == 401


def test_fake_token_rejected(client):
    res = client.get("/api/me", headers={"Authorization": "Bearer not.a.real.token"})
    assert res.status_code == 401
