"""Xuất đặc tả OpenAPI của FastAPI ra frontend/site/api-docs/openapi.json cho trang Swagger công khai.

Chạy từ thư mục backend (cần cài requirements.txt):
    cd backend && python ../scripts/export_openapi.py

CI chạy lại script này và báo lỗi nếu file trong repo khác với code (tài liệu API không bao giờ lệch code).
"""

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "frontend" / "site" / "api-docs" / "openapi.json"

# Không cần database / Redis thật để sinh tài liệu
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("APP_ENV", "docs")
sys.path.insert(0, str(ROOT / "backend"))

from app.main import app  # noqa: E402

DESCRIPTION = """\
API của **Personal Web Platform** — FastAPI + PostgreSQL + Redis/Celery, xác thực bằng Keycloak (OIDC, Bearer JWT).

**Trên trang bạn đang xem (Cloudflare Pages):** chỉ `POST /api/contact` chạy thật — được xử lý bởi một
Cloudflare Pages Function và gửi email qua Resend. Các endpoint còn lại chạy khi deploy đầy đủ bằng
Docker Compose hoặc Kubernetes (Helm).

**On this site (Cloudflare Pages):** only `POST /api/contact` is live (a Pages Function that emails the owner).
The other endpoints run in the full Docker Compose / Kubernetes deployment.

Mã nguồn: [github.com/huuhai28/web-platform](https://github.com/huuhai28/web-platform)
"""

spec = app.openapi()
spec["info"]["title"] = "Personal Web Platform API"
spec["info"]["description"] = DESCRIPTION
spec["servers"] = [{"url": "/", "description": "Trang hiện tại"}]
spec["tags"] = [
    {"name": "public", "description": "Không cần đăng nhập"},
    {"name": "auth", "description": "Cần access token của Keycloak"},
    {"name": "ops", "description": "Health check cho Docker / Kubernetes"},
]

TAGS = {
    "/api/health": "ops", "/api/health/live": "ops", "/api/health/ready": "ops",
    "/api/profile": "public", "/api/projects": "public", "/api/contact": "public",
    "/api/me": "auth", "/api/admin/messages": "auth",
}
for path, operations in spec["paths"].items():
    for operation in operations.values():
        operation["tags"] = [TAGS.get(path, "public")]

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"wrote {OUTPUT.relative_to(ROOT)} ({len(spec['paths'])} paths)")
