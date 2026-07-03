from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, health, member_titles, users

app = FastAPI(title="Rotary Admin API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(member_titles.router, prefix="/api", tags=["member-titles"])
app.include_router(users.router, prefix="/api", tags=["users"])
app.include_router(auth.router)
