import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.core.currency_conversion import convert_totals
from app.core.rotary_year import rotary_year
from app.core.rotary_year import rotary_year as compute_current_rotary_year
from app.db.session import get_db
from app.models import Donation, ExchangeRate, Organisation, User
from app.schemas.donation import DonationCreate, DonationRead, DonationUpdate
from app.schemas.donation_statistics import (
    ConvertedTotals,
    CurrencyStatistics,
    DonationStatistics,
    LabelCount,
    LabelValueFloat,
)

router = APIRouter()

NGOS_ORGANISATIONS = "ngos.organisations"
NGOS_STATISTICS = "ngos.statistics"


def _get_organisation_or_404(db: Session, organisation_id: uuid.UUID) -> Organisation:
    organisation = db.get(Organisation, organisation_id)
    if organisation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Organisation not found"
        )
    return organisation


def _get_donation_or_404(db: Session, donation_id: uuid.UUID) -> Donation:
    donation = db.get(Donation, donation_id)
    if donation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Donation not found")
    return donation


@router.get(
    "/organisations/{organisation_id}/donations", response_model=list[DonationRead]
)
def list_organisation_donations(
    organisation_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(NGOS_ORGANISATIONS, "read")),
):
    _get_organisation_or_404(db, organisation_id)
    return (
        db.query(Donation)
        .filter(Donation.organisation_id == organisation_id)
        .order_by(Donation.rotary_year.desc(), Donation.donation_date.desc())
        .all()
    )


@router.post(
    "/organisations/{organisation_id}/donations",
    response_model=DonationRead,
    status_code=201,
)
def create_donation(
    organisation_id: uuid.UUID,
    payload: DonationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_access(NGOS_ORGANISATIONS, "write")),
):
    _get_organisation_or_404(db, organisation_id)

    data = payload.model_dump()
    if data.get("rotary_year") is None:
        data["rotary_year"] = rotary_year(data["donation_date"])

    donation = Donation(
        organisation_id=organisation_id, created_by=current_user.id, **data
    )
    db.add(donation)
    db.commit()
    db.refresh(donation)
    return donation


@router.get("/donations", response_model=list[DonationRead])
def list_donations(
    rotary_year: int | None = Query(
        None, description="Filter to a single rotary year (across all organisations)"
    ),
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(NGOS_ORGANISATIONS, "read")),
):
    query = db.query(Donation)
    if rotary_year is not None:
        query = query.filter(Donation.rotary_year == rotary_year)
    return query.order_by(
        Donation.rotary_year.desc(), Donation.donation_date.desc()
    ).all()


@router.get("/donations/statistics", response_model=DonationStatistics)
def donation_statistics(
    rotary_year: int | None = Query(
        None,
        description="Rotary year to compute the selected-year figures for; "
        "defaults to the current rotary year",
    ),
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(NGOS_STATISTICS, "read")),
):
    # Donation amounts are never summed across currencies (Story 3.7) — each
    # currency actually used gets its own independent breakdown.
    currencies = [
        row[0]
        for row in db.query(Donation.currency).distinct().order_by(Donation.currency).all()
    ]

    by_currency = []
    for currency in currencies:
        base_query = db.query(Donation).filter(Donation.currency == currency)

        total_by_year = (
            base_query.with_entities(Donation.rotary_year, func.sum(Donation.amount))
            .group_by(Donation.rotary_year)
            .order_by(Donation.rotary_year)
            .all()
        )
        orgs_by_year = (
            base_query.with_entities(
                Donation.rotary_year,
                func.count(func.distinct(Donation.organisation_id)),
            )
            .group_by(Donation.rotary_year)
            .order_by(Donation.rotary_year)
            .all()
        )
        total_by_org = (
            db.query(Organisation.name, func.sum(Donation.amount))
            .join(Donation, Donation.organisation_id == Organisation.id)
            .filter(Donation.currency == currency)
            .group_by(Organisation.id, Organisation.name)
            .order_by(func.sum(Donation.amount).desc())
            .all()
        )

        grand_total = sum(float(total) for _, total in total_by_year)

        by_currency.append(
            CurrencyStatistics(
                currency=currency,
                total_by_rotary_year=[
                    LabelValueFloat(label=str(year), value=float(total))
                    for year, total in total_by_year
                ],
                total_by_organisation=[
                    LabelValueFloat(label=name, value=float(total))
                    for name, total in total_by_org
                ],
                organisations_by_rotary_year=[
                    LabelCount(label=str(year), value=count) for year, count in orgs_by_year
                ],
                grand_total=grand_total,
            )
        )

    selected_year = rotary_year if rotary_year is not None else compute_current_rotary_year(
        date.today()
    )

    rates = {
        rate.currency_code: (float(rate.rate_to_hkd), float(rate.rate_to_usd))
        for rate in db.query(ExchangeRate).all()
    }

    all_donations_rows = db.query(Donation.currency, Donation.amount).all()
    all_time = ConvertedTotals(
        **convert_totals(
            ((currency, float(amount)) for currency, amount in all_donations_rows), rates
        )
    )
    all_time_organisations_count = (
        db.query(func.count(func.distinct(Donation.organisation_id))).scalar() or 0
    )

    selected_year_query = db.query(Donation).filter(Donation.rotary_year == selected_year)
    selected_year_rows = selected_year_query.with_entities(
        Donation.currency, Donation.amount
    ).all()
    selected_year_totals = ConvertedTotals(
        **convert_totals(
            ((currency, float(amount)) for currency, amount in selected_year_rows), rates
        )
    )
    selected_year_organisations_count = (
        selected_year_query.with_entities(func.count(func.distinct(Donation.organisation_id)))
        .scalar()
        or 0
    )

    return DonationStatistics(
        by_currency=by_currency,
        selected_rotary_year=selected_year,
        selected_year_organisations_count=selected_year_organisations_count,
        selected_year=selected_year_totals,
        all_time_organisations_count=all_time_organisations_count,
        all_time=all_time,
    )


@router.patch("/donations/{donation_id}", response_model=DonationRead)
def update_donation(
    donation_id: uuid.UUID,
    payload: DonationUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(NGOS_ORGANISATIONS, "write")),
):
    donation = _get_donation_or_404(db, donation_id)

    data = payload.model_dump(exclude_unset=True)
    # If the date moved but the caller didn't explicitly override rotary_year,
    # keep the bucket in sync with the new date.
    if "donation_date" in data and "rotary_year" not in data:
        data["rotary_year"] = rotary_year(data["donation_date"])

    for field, value in data.items():
        setattr(donation, field, value)

    db.commit()
    db.refresh(donation)
    return donation


@router.delete("/donations/{donation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_donation(
    donation_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(NGOS_ORGANISATIONS, "write")),
):
    donation = _get_donation_or_404(db, donation_id)
    db.delete(donation)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
