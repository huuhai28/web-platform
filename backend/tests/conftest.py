import os
import tempfile

# Cấu hình môi trường test TRƯỚC khi import app: SQLite tạm thay PostgreSQL,
# Redis/Keycloak trỏ vào cổng không tồn tại để test chạy độc lập, không cần container.
_db_file = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ.update(
    APP_ENV="test",
    DATABASE_URL=f"sqlite:///{_db_file}",
    REDIS_URL="redis://127.0.0.1:1/0",
    KEYCLOAK_INTERNAL_URL="http://127.0.0.1:1/auth",
    CORS_ORIGINS="http://testserver",
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:  # chạy lifespan: tạo bảng + seed dữ liệu
        yield test_client
