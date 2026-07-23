import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import (
    attendance,
    auth,
    board,
    dashboard,
    dinner_event_types,
    dinner_forecast,
    donations,
    email_drafts,
    event,
    event_cost,
    event_guest,
    event_item,
    event_rundown,
    event_setup,
    event_sponsor,
    event_summary,
    exchange_rates,
    fee_runs,
    fee_settings,
    finance,
    finance_categories,
    health,
    honorifics,
    member_applications,
    member_email,
    member_fees,
    member_titles,
    members,
    ngo_classifications,
    organisations,
    ppt_templates,
    rotary_friend_email,
    rotary_friend_import,
    rotary_friends,
    rotary_years,
    service_hours,
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
os.makedirs(os.path.join(settings.upload_dir, "ppt-templates"), exist_ok=True)
os.makedirs(os.path.join(settings.upload_dir, "applications"), exist_ok=True)
app.mount("/static", StaticFiles(directory=settings.upload_dir), name="static")

app.add_exception_handler(Exception, unhandled_exception_handler)

app.include_router(health.router, prefix="/api/v1", tags=["health"])
app.include_router(member_titles.router, prefix="/api/v1", tags=["member-titles"])
app.include_router(honorifics.router, prefix="/api/v1", tags=["honorifics"])
app.include_router(member_email.router, prefix="/api/v1", tags=["members"])
app.include_router(email_drafts.router, prefix="/api/v1", tags=["email-drafts"])
app.include_router(members.router, prefix="/api/v1", tags=["members"])
app.include_router(member_applications.router, prefix="/api/v1", tags=["member-applications"])
app.include_router(organisations.router, prefix="/api/v1", tags=["organisations"])
app.include_router(ppt_templates.router, prefix="/api/v1", tags=["ppt-templates"])
app.include_router(ngo_classifications.router, prefix="/api/v1", tags=["ngo-classifications"])
app.include_router(donations.router, prefix="/api/v1", tags=["donations"])
app.include_router(service_hours.router, prefix="/api/v1", tags=["service-hours"])
app.include_router(exchange_rates.router, prefix="/api/v1", tags=["exchange-rates"])
app.include_router(fee_settings.router, prefix="/api/v1", tags=["fee-settings"])
app.include_router(fee_runs.router, prefix="/api/v1", tags=["fee-runs"])
app.include_router(finance.router, prefix="/api/v1", tags=["finance"])
app.include_router(finance_categories.router, prefix="/api/v1", tags=["finance"])
app.include_router(member_fees.router, prefix="/api/v1", tags=["member-fees"])
app.include_router(rotary_friend_email.router, prefix="/api/v1", tags=["rotary-friends"])
app.include_router(rotary_friend_import.router, prefix="/api/v1", tags=["rotary-friends"])
app.include_router(rotary_friends.router, prefix="/api/v1", tags=["rotary-friends"])
app.include_router(rotary_years.router, prefix="/api/v1", tags=["rotary-years"])
app.include_router(users.router, prefix="/api/v1", tags=["users"])
app.include_router(dashboard.router, prefix="/api/v1", tags=["dashboard"])
app.include_router(board.router, prefix="/api/v1", tags=["board"])
app.include_router(attendance.router, prefix="/api/v1", tags=["attendance"])
app.include_router(dinner_forecast.router, prefix="/api/v1", tags=["dinner-forecast"])
app.include_router(dinner_event_types.router, prefix="/api/v1", tags=["dinner-event-types"])
app.include_router(event.router, prefix="/api/v1", tags=["events"])
app.include_router(event_setup.router, prefix="/api/v1", tags=["events"])
app.include_router(event_guest.router, prefix="/api/v1", tags=["events"])
app.include_router(event_item.router, prefix="/api/v1", tags=["events"])
app.include_router(event_cost.router, prefix="/api/v1", tags=["events"])
app.include_router(event_sponsor.router, prefix="/api/v1", tags=["events"])
app.include_router(event_summary.router, prefix="/api/v1", tags=["events"])
app.include_router(event_rundown.router, prefix="/api/v1", tags=["events"])
app.include_router(auth.router)
