import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import (
    auth,
    board,
    dashboard,
    donations,
    exchange_rates,
    fee_runs,
    fee_settings,
    health,
    member_email,
    member_fees,
    member_titles,
    members,
    organisations,
    rotary_friend_email,
    rotary_friend_import,
    rotary_friends,
    users,
)
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
os.makedirs(os.path.join(settings.upload_dir, "organisations"), exist_ok=True)
os.makedirs(os.path.join(settings.upload_dir, "email-attachments"), exist_ok=True)
app.mount("/static", StaticFiles(directory=settings.upload_dir), name="static")

app.add_exception_handler(Exception, unhandled_exception_handler)

app.include_router(health.router, prefix="/api/v1", tags=["health"])
app.include_router(member_titles.router, prefix="/api/v1", tags=["member-titles"])
app.include_router(member_email.router, prefix="/api/v1", tags=["members"])
app.include_router(members.router, prefix="/api/v1", tags=["members"])
app.include_router(organisations.router, prefix="/api/v1", tags=["organisations"])
app.include_router(donations.router, prefix="/api/v1", tags=["donations"])
app.include_router(exchange_rates.router, prefix="/api/v1", tags=["exchange-rates"])
app.include_router(fee_settings.router, prefix="/api/v1", tags=["fee-settings"])
app.include_router(fee_runs.router, prefix="/api/v1", tags=["fee-runs"])
app.include_router(member_fees.router, prefix="/api/v1", tags=["member-fees"])
app.include_router(rotary_friend_email.router, prefix="/api/v1", tags=["rotary-friends"])
app.include_router(rotary_friend_import.router, prefix="/api/v1", tags=["rotary-friends"])
app.include_router(rotary_friends.router, prefix="/api/v1", tags=["rotary-friends"])
app.include_router(users.router, prefix="/api/v1", tags=["users"])
app.include_router(dashboard.router, prefix="/api/v1", tags=["dashboard"])
app.include_router(board.router, prefix="/api/v1", tags=["board"])
app.include_router(auth.router)
