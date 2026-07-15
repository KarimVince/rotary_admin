from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.core.config import settings
from app.core.email_client import EmailSendError, send_email
from app.core.rotary_year import rotary_year_bounds
from app.db.session import get_db
from app.models import EmailLog, FeeSettings, Member, MemberFee
from app.schemas.member_fee import (
    FeeInvoiceSendRequest,
    FeeInvoiceSendResult,
    FeeRunCreate,
    FeeRunResult,
    MemberFeeRead,
)

router = APIRouter()

FEES_KEY = "fees.run"


@router.get("/fee-runs/{rotary_year}", response_model=list[MemberFeeRead])
def list_member_fees_for_year(
    rotary_year: int,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(FEES_KEY, "read")),
):
    return (
        db.query(MemberFee)
        .filter(MemberFee.rotary_year == rotary_year)
        .order_by(MemberFee.created_at)
        .all()
    )

_PRICE_FIELD_BY_TIER = {
    ("early_bird", False): "early_bird_single_price",
    ("early_bird", True): "early_bird_couple_price",
    ("full", False): "full_single_price",
    ("full", True): "full_couple_price",
}


def _resolve_amount_due(fee_settings: FeeSettings, price_type: str, is_couple: bool) -> float:
    field = _PRICE_FIELD_BY_TIER[(price_type, is_couple)]
    return getattr(fee_settings, field)


@router.post("/fee-runs", response_model=FeeRunResult, status_code=201)
def create_fee_run(
    payload: FeeRunCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_access(FEES_KEY, "write")),
):
    fee_settings = (
        db.query(FeeSettings).filter(FeeSettings.rotary_year == payload.rotary_year).first()
    )
    if fee_settings is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No fee settings configured for rotary year {payload.rotary_year}",
        )

    # Story 8.14: honorary members (Member.is_honorary) don't get billed —
    # same behaviour as when "honorary" was its own status value that never
    # matched this "active" filter.
    # Story 8.29: scope by membership dates for the *selected* rotary year
    # rather than Member.status (today's status), so past years correctly
    # include members who have since left the club, and exclude members who
    # joined after the selected year ended.
    year_start, year_end = rotary_year_bounds(payload.rotary_year)
    members_query = db.query(Member).filter(
        Member.is_honorary.is_(False),
        Member.join_date <= year_end,
        or_(Member.leave_date.is_(None), Member.leave_date >= year_start),
    )
    if payload.target == "member_ids":
        members_query = members_query.filter(Member.id.in_(payload.member_ids))
    members = members_query.all()

    existing_fees = {
        fee.member_id: fee
        for fee in db.query(MemberFee)
        .filter(MemberFee.rotary_year == payload.rotary_year)
        .all()
    }

    created_count = 0
    updated_count = 0
    skipped_paid_count = 0
    result_fees: list[MemberFee] = []

    for member in members:
        existing = existing_fees.get(member.id)

        if existing is not None and existing.is_paid:
            skipped_paid_count += 1
            result_fees.append(existing)
            continue

        amount_due = _resolve_amount_due(fee_settings, payload.price_type, member.is_couple)

        if existing is None:
            fee = MemberFee(
                member_id=member.id,
                rotary_year=payload.rotary_year,
                price_type=payload.price_type,
                is_couple_at_billing=member.is_couple,
                amount_due=amount_due,
                created_by=current_user.id,
            )
            db.add(fee)
            created_count += 1
            result_fees.append(fee)
        else:
            existing.price_type = payload.price_type
            existing.is_couple_at_billing = member.is_couple
            existing.amount_due = amount_due
            updated_count += 1
            result_fees.append(existing)

    db.commit()
    for fee in result_fees:
        db.refresh(fee)

    return FeeRunResult(
        rotary_year=payload.rotary_year,
        price_type=payload.price_type,
        created_count=created_count,
        updated_count=updated_count,
        skipped_paid_count=skipped_paid_count,
        member_fees=result_fees,
    )


def _invoice_html(member: Member, fee: MemberFee, fee_settings: FeeSettings) -> str:
    tier_label = "Early Bird" if fee.price_type == "early_bird" else "Full"
    return f"""
    <p>Dear {member.first_name} {member.last_name},</p>
    <p>Your Rotary Club of Discovery Bay membership fee for the {fee.rotary_year}-{fee.rotary_year + 1}
    rotary year is due.</p>
    <ul>
      <li>Price tier: {tier_label} ({"Couple" if fee.is_couple_at_billing else "Single"})</li>
      <li>Amount due: {fee.amount_due} {fee_settings.currency}</li>
    </ul>
    <p>{settings.fee_payment_instructions}</p>
    """


@router.post("/fee-runs/{rotary_year}/send", response_model=FeeInvoiceSendResult, status_code=201)
def send_fee_invoices(
    rotary_year: int,
    payload: FeeInvoiceSendRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_access(FEES_KEY, "write")),
):
    fee_settings = db.query(FeeSettings).filter(FeeSettings.rotary_year == rotary_year).first()
    if fee_settings is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No fee settings configured for rotary year {rotary_year}",
        )

    fees_query = db.query(MemberFee).filter(MemberFee.rotary_year == rotary_year)
    if payload.member_ids:
        fees_query = fees_query.filter(MemberFee.member_id.in_(payload.member_ids))
    fees = fees_query.all()

    members_by_id = {
        member.id: member
        for member in db.query(Member).filter(Member.id.in_([fee.member_id for fee in fees])).all()
    }

    sent_count = 0
    skipped_paid_count = 0
    failed_count = 0
    result_fees: list[MemberFee] = []

    for fee in fees:
        if fee.is_paid:
            skipped_paid_count += 1
            result_fees.append(fee)
            continue

        member = members_by_id.get(fee.member_id)

        if member is None or not member.email:
            failed_count += 1
            result_fees.append(fee)
            continue
        try:
            send_email(
                to_email=member.email,
                to_name=f"{member.first_name} {member.last_name}",
                subject=f"Rotary membership fee invoice — {rotary_year}-{rotary_year + 1}",
                html_body=_invoice_html(member, fee, fee_settings),
            )
        except EmailSendError:
            failed_count += 1
            result_fees.append(fee)
            continue

        fee.invoice_send_count += 1
        fee.invoice_sent_at = datetime.now(timezone.utc)
        fee.last_channel = "email"
        sent_count += 1
        result_fees.append(fee)

    if sent_count == 0:
        log_status = "no_recipients" if failed_count == 0 else "failed"
    elif failed_count == 0:
        log_status = "sent"
    else:
        log_status = "partial_failure"

    email_log = EmailLog(
        sent_by=current_user.id,
        subject=f"Rotary membership fee invoice — {rotary_year}-{rotary_year + 1}",
        source_module="member_fees",
        recipient_group="member_ids" if payload.member_ids else "all_unpaid",
        recipient_count=sent_count,
        status=log_status,
    )
    db.add(email_log)
    db.commit()
    for fee in result_fees:
        db.refresh(fee)
    db.refresh(email_log)

    return FeeInvoiceSendResult(
        rotary_year=rotary_year,
        sent_count=sent_count,
        skipped_paid_count=skipped_paid_count,
        failed_count=failed_count,
        email_log_id=email_log.id,
        member_fees=result_fees,
    )
