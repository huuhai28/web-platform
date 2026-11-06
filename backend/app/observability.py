"""Log JSON có request ID và metrics Prometheus cho FastAPI.

- Mỗi request có một request ID: lấy từ header X-Request-ID (nginx/Kong đã gắn) hoặc tự sinh,
  trả lại cho client qua header X-Request-ID và có mặt trong mọi dòng log của request đó.
- Log in ra stdout dạng JSON một dòng → Filebeat/Logstash đọc và đưa vào Elasticsearch không cần parse.
- /metrics (không nằm dưới /api nên KHÔNG đi qua nginx ra Internet) cho Prometheus scrape.
"""

from __future__ import annotations

import json
import logging
import sys
import time
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone

from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

SERVICE_NAME = "portfolio-api"
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
_RESERVED = set(vars(logging.makeLogRecord({})))


class JsonFormatter(logging.Formatter):
    """Một dòng JSON cho mỗi bản ghi log; các field truyền qua `extra=` được giữ nguyên."""

    def __init__(self, service: str = SERVICE_NAME) -> None:
        super().__init__()
        self.service = service

    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "@timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "service": self.service,
            "request_id": request_id_var.get(),
        }
        entry.update({k: v for k, v in vars(record).items() if k not in _RESERVED and not k.startswith("_")})
        if record.exc_info:
            entry["error.stack"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False, default=str)


def configure_logging(service: str = SERVICE_NAME, level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter(service))
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level)
    # Access log của uvicorn bị thay bằng log request JSON của middleware bên dưới
    logging.getLogger("uvicorn.access").disabled = True
    for name in ("uvicorn", "uvicorn.error"):
        logging.getLogger(name).handlers[:] = []
        logging.getLogger(name).propagate = True


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------
HTTP_REQUESTS = Counter(
    "http_requests_total", "Số request HTTP", ["method", "route", "status"]
)
HTTP_LATENCY = Histogram(
    "http_request_duration_seconds",
    "Thời gian xử lý request (giây)",
    ["method", "route"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5),
)
CONTACT_MESSAGES = Counter("contact_messages_total", "Số tin nhắn liên hệ đã lưu")

_access_log = logging.getLogger("http.access")


def _route_template(request: Request) -> str:
    """Dùng mẫu route (/api/items/{id}) thay vì URL thật để metrics không bùng nổ số nhãn."""
    route = request.scope.get("route")
    return getattr(route, "path", None) or "unmatched"


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        incoming = request.headers.get("x-request-id", "")
        request_id = incoming if 0 < len(incoming) <= 128 else uuid.uuid4().hex
        token = request_id_var.set(request_id)
        start = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            response.headers["X-Request-ID"] = request_id
            return response
        except Exception:
            _access_log.exception("unhandled error")
            raise
        finally:
            duration = time.perf_counter() - start
            route = _route_template(request)
            if route != "/metrics":
                HTTP_REQUESTS.labels(request.method, route, str(status)).inc()
                HTTP_LATENCY.labels(request.method, route).observe(duration)
                level = logging.ERROR if status >= 500 else logging.WARNING if status >= 400 else logging.INFO
                if not route.startswith("/api/health"):  # health check chạy liên tục, không ghi log
                    _access_log.log(
                        level,
                        "%s %s %s",
                        request.method,
                        request.url.path,
                        status,
                        extra={
                            "http.method": request.method,
                            "url.path": request.url.path,
                            "http.route": route,
                            "http.status_code": status,
                            "duration_ms": round(duration * 1000, 2),
                            "client.ip": request.headers.get("x-real-ip") or (request.client.host if request.client else None),
                            "user_agent": request.headers.get("user-agent", "")[:200],
                        },
                    )
            request_id_var.reset(token)


def metrics_response() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
