from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, dashboard, health, member_titles, users
from app.core.config import settings
from app.core.exception_handlers import unhandled_exception_handler

app = FastAPI(title="Rotary Admin API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(Exception, unhandled_exception_handler)

app.include_router(health.router, prefix="/api/v1", tags=["health"])
app.include_router(member_titles.router, prefix="/api/v1", tags=["member-titles"])
app.include_router(users.router, prefix="/api/v1", tags=["users"])
app.include_router(dashboard.router, prefix="/api/v1", tags=["dashboard"])
app.include_router(auth.router)
