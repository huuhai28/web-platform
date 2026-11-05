from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import get_current_user, require_admin
from .config import settings
from .database import Base, SessionLocal, engine, get_db
from .models import ContactMessage, Profile, Project
from .schemas import AuthenticatedUser, ContactCreate, ContactRead, ProfileRead, ProjectRead
from .seed import seed_database
from .worker import broker_is_reachable, send_contact_notification


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_database(db)
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


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "healthy", "environment": settings.app_env}


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

