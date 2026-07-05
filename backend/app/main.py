import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import auth, dashboard, health, member_email, member_titles, members, users
from app.core.config import settings
from app.core.exception_handlers import unhandled_exception_handler

app = FastAPI(title="Rotary Admin API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(os.path.join(settings.upload_dir, "members"), exist_ok=True)
os.makedirs(os.path.join(settings.upload_dir, "email-attachments"), exist_ok=True)
app.mount("/static", StaticFiles(directory=settings.upload_dir), name="static")

app.add_exception_handler(Exception, unhandled_exception_handler)

app.include_router(health.router, prefix="/api/v1", tags=["health"])
app.include_router(member_titles.router, prefix="/api/v1", tags=["member-titles"])
app.include_router(member_email.router, prefix="/api/v1", tags=["members"])
app.include_router(members.router, prefix="/api/v1", tags=["members"])
app.include_router(users.router, prefix="/api/v1", tags=["users"])
app.include_router(dashboard.router, prefix="/api/v1", tags=["dashboard"])
app.include_router(auth.router)
