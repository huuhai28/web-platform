import logging
from contextlib import asynccontextmanager
from typing import Annotated

import redis
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from .auth import get_current_user, require_admin
from .config import settings
from .database import Base, SessionLocal, engine, get_db
from .models import ContactMessage, Profile, Project
from .observability import CONTACT_MESSAGES, RequestContextMiddleware, configure_logging, metrics_response
from .schemas import AuthenticatedUser, ContactCreate, ContactRead, ProfileRead, ProjectRead
from .seed import seed_database
from .worker import broker_is_reachable, send_contact_notification

configure_logging("portfolio-api")
log = logging.getLogger("portfolio.api")


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_database(db)
    log.info("api started", extra={"app.env": settings.app_env})
    yield


# Production: tắt Swagger UI / OpenAPI để không lộ cấu trúc API ra ngoài.
app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.add_middleware(RequestContextMiddleware)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "healthy", "environment": settings.app_env}


@app.get("/api/health/live")
def liveness() -> dict[str, str]:
    """Process còn sống. Kubernetes livenessProbe: lỗi → restart pod."""
    return {"status": "alive"}


@app.get("/api/health/ready")
def readiness() -> JSONResponse:
    """Sẵn sàng nhận traffic: DB và Redis phải trả lời. Kubernetes readinessProbe: lỗi → ngừng gửi traffic tới pod."""
    checks: dict[str, str] = {}
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:  # noqa: BLE001 — báo lỗi thay vì crash
        checks["database"] = f"error: {type(exc).__name__}"
    try:
        redis.Redis.from_url(settings.redis_url, socket_connect_timeout=0.5, socket_timeout=0.5).ping()
        checks["redis"] = "ok"
    except Exception as exc:  # noqa: BLE001
        checks["redis"] = f"error: {type(exc).__name__}"
    ready = all(v == "ok" for v in checks.values())
    if not ready:
        log.warning("readiness check failed", extra={"checks": checks})
    return JSONResponse({"status": "ready" if ready else "not_ready", "checks": checks}, status_code=200 if ready else 503)


@app.get("/metrics", include_in_schema=False)
def metrics():
    """Prometheus scrape (chỉ trong mạng nội bộ — nginx không proxy đường dẫn này)."""
    return metrics_response()


@app.get("/api/profile", response_model=ProfileRead)
def read_profile(db: Annotated[Session, Depends(get_db)]) -> Profile:
    profile = db.scalar(select(Profile).limit(1))
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@app.get("/api/projects", response_model=list[ProjectRead])
def read_projects(db: Annotated[Session, Depends(get_db)]) -> list[Project]:
    return list(db.scalars(select(Project).order_by(Project.featured.desc(), Project.id)).all())


@app.post("/api/contact", response_model=ContactRead, status_code=status.HTTP_201_CREATED)
def create_contact(payload: ContactCreate, db: Annotated[Session, Depends(get_db)]) -> ContactMessage:
    contact = ContactMessage(**payload.model_dump())
    db.add(contact)
    db.commit()
    db.refresh(contact)
    CONTACT_MESSAGES.inc()
    log.info("contact message stored", extra={"contact.id": contact.id, "contact.subject": payload.subject[:80]})
    if broker_is_reachable():
        try:
            send_contact_notification.delay(payload.name, payload.email, payload.subject, payload.message)
        except Exception:
            # The message remains stored even when the optional notification worker is unavailable.
            pass
    return contact


@app.get("/api/me", response_model=AuthenticatedUser)
def read_me(user: Annotated[AuthenticatedUser, Depends(get_current_user)]) -> AuthenticatedUser:
    return user


@app.get("/api/admin/messages", response_model=list[ContactRead])
def read_messages(
    _: Annotated[AuthenticatedUser, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> list[ContactMessage]:
    return list(db.scalars(select(ContactMessage).order_by(ContactMessage.created_at.desc())).all())

