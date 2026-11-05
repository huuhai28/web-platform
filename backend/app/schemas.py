from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    role: str
    summary: str
    location: str
    email: EmailStr
    availability: str


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    stack: str
    outcome: str
    featured: bool


class ContactCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    subject: str = Field(min_length=3, max_length=200)
    message: str = Field(min_length=10, max_length=5000)


class ContactRead(ContactCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class AuthenticatedUser(BaseModel):
    subject: str
    username: str
    email: str | None = None
    roles: list[str]

