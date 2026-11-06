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


def test_liveness(client):
    assert client.get("/api/health/live").json() == {"status": "alive"}


def test_readiness_reports_each_dependency(client):
    # Trong test: SQLite có, Redis trỏ vào cổng không tồn tại → 503 và chỉ rõ redis lỗi
    res = client.get("/api/health/ready")
    assert res.status_code == 503
    body = res.json()
    assert body["checks"]["database"] == "ok"
    assert body["checks"]["redis"].startswith("error")


def test_request_id_is_echoed_or_generated(client):
    res = client.get("/api/health", headers={"X-Request-ID": "abc-123"})
    assert res.headers["X-Request-ID"] == "abc-123"
    generated = client.get("/api/health").headers["X-Request-ID"]
    assert len(generated) == 32


def test_metrics_exposed_with_route_templates(client):
    client.get("/api/profile")
    body = client.get("/metrics").text
    assert 'http_requests_total{method="GET",route="/api/profile",status="200"}' in body
    assert "http_request_duration_seconds_bucket" in body
    assert "contact_messages_total" in body


def test_access_log_is_json_with_request_id(client, caplog):
    import json
    import logging

    from app.observability import JsonFormatter

    with caplog.at_level(logging.INFO, logger="http.access"):
        client.get("/api/profile", headers={"X-Request-ID": "log-test-1"})
    record = next(r for r in caplog.records if r.name == "http.access" and r.getMessage() == "GET /api/profile 200")
    entry = json.loads(JsonFormatter().format(record))
    assert entry["http.status_code"] == 200
    assert entry["http.route"] == "/api/profile"
    assert entry["service"] == "portfolio-api"
    assert "duration_ms" in entry and "@timestamp" in entry
