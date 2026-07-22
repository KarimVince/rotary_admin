import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.api.ppt_templates import download_template_for_year
from app.core.currency_conversion import convert_totals
from app.core.donation_statistics_report import (
    build_pdf_report,
    build_pptx_report,
    resolve_logo_bytes,
)
from app.core.report_filename import generate_report_filename
from app.core.rotary_year import rotary_year
from app.core.rotary_year import rotary_year as compute_current_rotary_year
from app.db.session import get_db
from app.models import Donation, ExchangeRate, NgoClassification, Organisation, ServiceHour, User
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


def _compute_donation_statistics(
    db: Session, rotary_year_filter: int | None, classification_id: uuid.UUID | None
) -> DonationStatistics:
    selected_year = (
        rotary_year_filter
        if rotary_year_filter is not None
        else compute_current_rotary_year(date.today())
    )

    classification_org_ids = None
    if classification_id is not None:
        classification_org_ids = db.query(Organisation.id).filter(
            Organisation.classification_id == classification_id
        )

    # Donation amounts are never summed across currencies (Story 3.7) — each
    # currency actually used gets its own independent breakdown.
    currency_query = db.query(Donation.currency).distinct()
    if classification_org_ids is not None:
        currency_query = currency_query.filter(
            Donation.organisation_id.in_(classification_org_ids)
        )
    currencies = [row[0] for row in currency_query.order_by(Donation.currency).all()]

    classification_names = dict(
        db.query(NgoClassification.id, NgoClassification.name).all()
    )

    by_currency = []
    for currency in currencies:
        base_query = db.query(Donation).filter(Donation.currency == currency)
        if classification_org_ids is not None:
            base_query = base_query.filter(Donation.organisation_id.in_(classification_org_ids))

        classification_rows = (
            db.query(Organisation.classification_id, func.sum(Donation.amount))
            .join(Donation, Donation.organisation_id == Organisation.id)
            .filter(Donation.currency == currency, Donation.rotary_year == selected_year)
            .group_by(Organisation.classification_id)
            .all()
        )
        total_by_classification = [
            LabelValueFloat(
                label=classification_names.get(class_id, "Unclassified")
                if class_id is not None
                else "Unclassified",
                value=float(total),
            )
            for class_id, total in classification_rows
        ]

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
        total_by_org_query = (
            db.query(Organisation.name, func.sum(Donation.amount))
            .join(Donation, Donation.organisation_id == Organisation.id)
            .filter(Donation.currency == currency)
        )
        if classification_org_ids is not None:
            total_by_org_query = total_by_org_query.filter(
                Donation.organisation_id.in_(classification_org_ids)
            )
        total_by_org = (
            total_by_org_query.group_by(Organisation.id, Organisation.name)
            .order_by(func.sum(Donation.amount).desc())
            .all()
        )

        # Story 8.30 — the year-scoped counterpart to total_by_org above
        # (which is all-time), for the Dashboard's "Selected Year" section.
        total_by_org_selected_year_query = (
            db.query(Organisation.name, func.sum(Donation.amount))
            .join(Donation, Donation.organisation_id == Organisation.id)
            .filter(Donation.currency == currency, Donation.rotary_year == selected_year)
        )
        if classification_org_ids is not None:
            total_by_org_selected_year_query = total_by_org_selected_year_query.filter(
                Donation.organisation_id.in_(classification_org_ids)
            )
        total_by_org_selected_year = (
            total_by_org_selected_year_query.group_by(Organisation.id, Organisation.name)
            .order_by(func.sum(Donation.amount).desc())
            .all()
        )

        # Story 8.30 — the all-time counterpart to total_by_classification
        # above (which is scoped to selected_year).
        classification_all_time_rows = (
            db.query(Organisation.classification_id, func.sum(Donation.amount))
            .join(Donation, Donation.organisation_id == Organisation.id)
            .filter(Donation.currency == currency)
        )
        if classification_org_ids is not None:
            classification_all_time_rows = classification_all_time_rows.filter(
                Donation.organisation_id.in_(classification_org_ids)
            )
        classification_all_time_rows = classification_all_time_rows.group_by(
            Organisation.classification_id
        ).all()
        total_by_classification_all_time = [
            LabelValueFloat(
                label=classification_names.get(class_id, "Unclassified")
                if class_id is not None
                else "Unclassified",
                value=float(total),
            )
            for class_id, total in classification_all_time_rows
        ]

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
                total_by_classification=total_by_classification,
                total_by_organisation_selected_year=[
                    LabelValueFloat(label=name, value=float(total))
                    for name, total in total_by_org_selected_year
                ],
                total_by_classification_all_time=total_by_classification_all_time,
            )
        )

    rates = {
        rate.currency_code: (float(rate.rate_to_hkd), float(rate.rate_to_usd))
        for rate in db.query(ExchangeRate).all()
    }

    all_time_query = db.query(Donation)
    if classification_org_ids is not None:
        all_time_query = all_time_query.filter(
            Donation.organisation_id.in_(classification_org_ids)
        )
    all_donations_rows = all_time_query.with_entities(Donation.currency, Donation.amount).all()
    all_time = ConvertedTotals(
        **convert_totals(
            ((currency, float(amount)) for currency, amount in all_donations_rows), rates
        )
    )
    all_time_organisations_count = (
        all_time_query.with_entities(func.count(func.distinct(Donation.organisation_id))).scalar()
        or 0
    )

    selected_year_query = db.query(Donation).filter(Donation.rotary_year == selected_year)
    if classification_org_ids is not None:
        selected_year_query = selected_year_query.filter(
            Donation.organisation_id.in_(classification_org_ids)
        )
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

    # Story 16.14 — volunteer service hours, scoped by the same
    # classification filter as everything else above but never currency-split
    # (hours have no currency).
    service_hours_query = db.query(ServiceHour)
    if classification_org_ids is not None:
        service_hours_query = service_hours_query.filter(
            ServiceHour.organisation_id.in_(classification_org_ids)
        )
    total_service_hours_all_time = float(
        service_hours_query.with_entities(func.coalesce(func.sum(ServiceHour.hours), 0)).scalar()
    )
    total_service_hours_selected_year = float(
        service_hours_query.filter(ServiceHour.rotary_year == selected_year)
        .with_entities(func.coalesce(func.sum(ServiceHour.hours), 0))
        .scalar()
    )
    service_hours_by_year_rows = (
        service_hours_query.with_entities(ServiceHour.rotary_year, func.sum(ServiceHour.hours))
        .group_by(ServiceHour.rotary_year)
        .order_by(ServiceHour.rotary_year)
        .all()
    )
    service_hours_by_rotary_year = [
        LabelValueFloat(label=str(year), value=float(total))
        for year, total in service_hours_by_year_rows
    ]

    return DonationStatistics(
        by_currency=by_currency,
        selected_rotary_year=selected_year,
        selected_year_organisations_count=selected_year_organisations_count,
        selected_year=selected_year_totals,
        all_time_organisations_count=all_time_organisations_count,
        total_service_hours_all_time=total_service_hours_all_time,
        total_service_hours_selected_year=total_service_hours_selected_year,
        service_hours_by_rotary_year=service_hours_by_rotary_year,
        all_time=all_time,
    )


def _ngo_breakdown_for_selected_year(
    db: Session,
    selected_year: int,
    currency: str | None,
    classification_org_ids,
) -> list[dict]:
    """Story 8.32 Integral detail — per-NGO totals for the selected year and
    currency, ordered descending, including id/logo for image embedding.
    Separate from `_compute_donation_statistics`'s LabelValueFloat rows
    (name only) since the report needs the logo file too."""
    if currency is None:
        return []
    query = (
        db.query(Organisation.name, Organisation.logo_url, func.sum(Donation.amount))
        .join(Donation, Donation.organisation_id == Organisation.id)
        .filter(Donation.currency == currency, Donation.rotary_year == selected_year)
    )
    if classification_org_ids is not None:
        query = query.filter(Donation.organisation_id.in_(classification_org_ids))
    rows = (
        query.group_by(Organisation.id, Organisation.name, Organisation.logo_url)
        .order_by(func.sum(Donation.amount).desc())
        .all()
    )
    return [
        {"name": name, "total": float(total), "logo_bytes": resolve_logo_bytes(logo_url)}
        for name, logo_url, total in rows
    ]


@router.get("/donations/statistics", response_model=DonationStatistics)
def donation_statistics(
    rotary_year: int | None = Query(
        None,
        description="Rotary year to compute the selected-year figures for; "
        "defaults to the current rotary year",
    ),
    classification_id: uuid.UUID | None = Query(
        None, description="Story 11.6: scope every figure to this NGO classification"
    ),
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(NGOS_STATISTICS, "read")),
):
    return _compute_donation_statistics(db, rotary_year, classification_id)


@router.post("/donations/statistics/report")
def generate_donation_statistics_report(
    report_format: Literal["pdf", "pptx"] = Query(..., alias="format"),
    report_type: Literal["simplified", "integral"] = Query("simplified", alias="type"),
    use_template: bool = Query(False),
    rotary_year: int | None = Query(None, description="Defaults to the current rotary year"),
    classification_id: uuid.UUID | None = Query(None),
    currency: str | None = Query(
        None, description="Defaults to the first currency with any donations, same as the page"
    ),
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(NGOS_STATISTICS, "read")),
):
    stats = _compute_donation_statistics(db, rotary_year, classification_id)
    selected_currency = currency or (stats.by_currency[0].currency if stats.by_currency else None)

    classification_org_ids = None
    if classification_id is not None:
        classification_org_ids = db.query(Organisation.id).filter(
            Organisation.classification_id == classification_id
        )
    ngo_breakdown = _ngo_breakdown_for_selected_year(
        db, stats.selected_rotary_year, selected_currency, classification_org_ids
    )

    template_path = None
    if use_template:
        if report_format != "pptx":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="The annual club template only applies to PowerPoint (PPTX) reports",
            )
        template_path = download_template_for_year(compute_current_rotary_year(date.today()))
        if template_path is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No annual template uploaded for this rotary year",
            )

    if report_format == "pdf":
        content = build_pdf_report(stats, selected_currency, ngo_breakdown, report_type=report_type)
        media_type = "application/pdf"
        filename = generate_report_filename(
            "ngo-statistics", "pdf", rotary_year=stats.selected_rotary_year
        )
    else:
        content = build_pptx_report(
            stats, selected_currency, ngo_breakdown, report_type=report_type,
            template_path=template_path,
        )
        media_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        filename = generate_report_filename(
            "ngo-statistics", "pptx", rotary_year=stats.selected_rotary_year
        )

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
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
