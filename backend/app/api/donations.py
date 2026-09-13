import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, case
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.core.currency_conversion import convert_totals
from app.core.donation_statistics_report import (
    build_pdf_report,
    build_pptx_comparison_report,
    build_pptx_report,
    resolve_logo_bytes,
)
from app.core.project_services_report import build_project_services_pdf, build_project_services_pptx
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
    # Story 16.35: a planned donation carries no donation_date to derive
    # this from — the schema already requires rotary_year in that case.
    if data.get("rotary_year") is None and data.get("donation_date") is not None:
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
        # Story 16.35: every "actual totals" query below is scoped to
        # planned=False — a planned donation must never inflate the
        # actual-donations figures (grand_total, by-year, by-org,
        # by-classification, all-time/selected-year converted totals). Its
        # own totals live only in planned_by_rotary_year below.
        base_query = db.query(Donation).filter(
            Donation.currency == currency, Donation.planned.is_(False)
        )
        if classification_org_ids is not None:
            base_query = base_query.filter(Donation.organisation_id.in_(classification_org_ids))

        classification_rows = (
            db.query(Organisation.classification_id, func.sum(Donation.amount))
            .join(Donation, Donation.organisation_id == Organisation.id)
            .filter(
                Donation.currency == currency,
                Donation.rotary_year == selected_year,
                Donation.planned.is_(False),
            )
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
            .filter(Donation.currency == currency, Donation.planned.is_(False))
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
            .filter(
                Donation.currency == currency,
                Donation.rotary_year == selected_year,
                Donation.planned.is_(False),
            )
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
            .filter(Donation.currency == currency, Donation.planned.is_(False))
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

        # Story 16.35 — planned (not-yet-made) donation totals, current
        # rotary year and any future one, never mixed into the actual-only
        # totals above.
        current_system_year = compute_current_rotary_year(date.today())
        planned_by_year_query = db.query(Donation).filter(
            Donation.currency == currency,
            Donation.planned.is_(True),
            Donation.rotary_year >= current_system_year,
        )
        if classification_org_ids is not None:
            planned_by_year_query = planned_by_year_query.filter(
                Donation.organisation_id.in_(classification_org_ids)
            )
        planned_by_year_rows = (
            planned_by_year_query.with_entities(Donation.rotary_year, func.sum(Donation.amount))
            .group_by(Donation.rotary_year)
            .order_by(Donation.rotary_year)
            .all()
        )
        planned_by_rotary_year = [
            LabelValueFloat(label=str(year), value=float(total))
            for year, total in planned_by_year_rows
        ]

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
                planned_by_rotary_year=planned_by_rotary_year,
            )
        )

    rates = {
        rate.currency_code: (float(rate.rate_to_hkd), float(rate.rate_to_usd))
        for rate in db.query(ExchangeRate).all()
    }

    all_time_query = db.query(Donation).filter(Donation.planned.is_(False))
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

    # Story 16.35 follow-up — "Organisations supported" on the Statistics
    # page counts either an actual OR a planned donation (unlike
    # all_time_organisations_count above, which stays actual-only for the
    # PPTX/PDF report's "Reach" figure) — same query without the
    # planned=False filter.
    all_time_with_planned_query = db.query(Donation)
    if classification_org_ids is not None:
        all_time_with_planned_query = all_time_with_planned_query.filter(
            Donation.organisation_id.in_(classification_org_ids)
        )
    all_time_organisations_count_with_planned = (
        all_time_with_planned_query.with_entities(
            func.count(func.distinct(Donation.organisation_id))
        ).scalar()
        or 0
    )

    selected_year_query = db.query(Donation).filter(
        Donation.rotary_year == selected_year, Donation.planned.is_(False)
    )
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

    # Story 16.35 follow-up — same actual-vs-actual+planned split as
    # all_time_organisations_count_with_planned above, scoped to the
    # selected year.
    selected_year_with_planned_query = db.query(Donation).filter(Donation.rotary_year == selected_year)
    if classification_org_ids is not None:
        selected_year_with_planned_query = selected_year_with_planned_query.filter(
            Donation.organisation_id.in_(classification_org_ids)
        )
    selected_year_organisations_count_with_planned = (
        selected_year_with_planned_query.with_entities(
            func.count(func.distinct(Donation.organisation_id))
        ).scalar()
        or 0
    )

    # Story 16.35 — converted planned total for the selected rotary year,
    # scoped the same as selected_year_totals above but planned=True.
    selected_year_planned_query = db.query(Donation).filter(
        Donation.rotary_year == selected_year, Donation.planned.is_(True)
    )
    if classification_org_ids is not None:
        selected_year_planned_query = selected_year_planned_query.filter(
            Donation.organisation_id.in_(classification_org_ids)
        )
    selected_year_planned_rows = selected_year_planned_query.with_entities(
        Donation.currency, Donation.amount
    ).all()
    selected_year_planned_totals = ConvertedTotals(
        **convert_totals(
            ((currency, float(amount)) for currency, amount in selected_year_planned_rows), rates
        )
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
        selected_year_planned=selected_year_planned_totals,
        selected_year_organisations_count_with_planned=selected_year_organisations_count_with_planned,
        all_time_organisations_count_with_planned=all_time_organisations_count_with_planned,
    )


def _project_services_rows_for_year(db: Session, year: int) -> list[dict]:
    """Fetch per-organisation data for the Project Services Report.

    Returns one dict per organisation that has any donation (actual or planned)
    OR any service hours (actual or planned) in the given rotary year.  Amounts
    are always in HKD — non-HKD donations are excluded from the totals.

    Keys: name, description, country, classification,
          actual_hkd, planned_hkd, actual_hours, planned_hours
    """
    # Determine active org ids (donation OR service hours)
    org_ids_don = {
        r[0]
        for r in db.query(Donation.organisation_id).filter(Donation.rotary_year == year).all()
    }
    org_ids_svc = {
        r[0]
        for r in db.query(ServiceHour.organisation_id).filter(ServiceHour.rotary_year == year).all()
    }
    all_ids = org_ids_don | org_ids_svc
    if not all_ids:
        return []

    # Org details (with classification name)
    orgs = (
        db.query(Organisation, NgoClassification.name.label("classification"))
        .outerjoin(NgoClassification, Organisation.classification_id == NgoClassification.id)
        .filter(Organisation.id.in_(all_ids))
        .all()
    )

    # Aggregate HKD donations by org (actual / planned separately)
    actual_hkd: dict = {}
    planned_hkd: dict = {}
    for org_id, amount, planned in db.query(
        Donation.organisation_id, Donation.amount, Donation.planned
    ).filter(Donation.rotary_year == year, Donation.currency == "HKD").all():
        target = planned_hkd if planned else actual_hkd
        target[org_id] = target.get(org_id, 0.0) + float(amount)

    # Aggregate service hours (actual / planned separately)
    actual_hrs: dict = {}
    planned_hrs: dict = {}
    for org_id, hours, planned in db.query(
        ServiceHour.organisation_id, ServiceHour.hours, ServiceHour.planned
    ).filter(ServiceHour.rotary_year == year).all():
        target = planned_hrs if planned else actual_hrs
        target[org_id] = target.get(org_id, 0.0) + float(hours)

    return [
        {
            "name": org.name,
            "description": org.description,
            "country": org.country,
            "classification": classification or "Unclassified",
            "actual_hkd": actual_hkd.get(org.id, 0.0),
            "planned_hkd": planned_hkd.get(org.id, 0.0),
            "actual_hours": actual_hrs.get(org.id, 0.0),
            "planned_hours": planned_hrs.get(org.id, 0.0),
            "logo_bytes": resolve_logo_bytes(org.logo_url),
        }
        for org, classification in orgs
    ]


def _ngo_report_rows_for_selected_year(
    db: Session,
    selected_year: int,
    currency: str | None,
    classification_org_ids,
) -> list[dict]:
    """Story 16.35, redesigned per the district-template handoff — one row
    per NGO with a donation (actual OR planned) in the selected rotary year,
    feeding both the PDF's organisation table and the PPTX's Organisations
    slide(s). "Area" maps to NGO Classification (`ngo_classifications`) —
    this app has no separate geographic/area field on Organisation, and
    classification is the only existing per-NGO grouping, so it's reused
    here. Supersedes the old separate Integral-only breakdown and the
    previous flat NGO-cards list — one function now, since the new design
    has a single Organisations view regardless of report_type."""
    if currency is None:
        return []
    # Correlated subquery: total volunteer hours for this org in the selected year.
    hours_sq = (
        db.query(func.coalesce(func.sum(ServiceHour.hours), 0))
        .filter(
            ServiceHour.organisation_id == Organisation.id,
            ServiceHour.rotary_year == selected_year,
        )
        .correlate(Organisation)
        .scalar_subquery()
    )
    query = (
        db.query(
            Organisation.name,
            Organisation.country,
            Organisation.logo_url,
            Organisation.contact_name,
            NgoClassification.name,
            func.sum(Donation.amount),
            hours_sq.label("volunteer_hours"),
        )
        .join(Donation, Donation.organisation_id == Organisation.id)
        .outerjoin(NgoClassification, Organisation.classification_id == NgoClassification.id)
        .filter(Donation.currency == currency, Donation.rotary_year == selected_year)
    )
    if classification_org_ids is not None:
        query = query.filter(Donation.organisation_id.in_(classification_org_ids))
    rows = (
        query.group_by(
            Organisation.id,
            Organisation.name,
            Organisation.country,
            Organisation.logo_url,
            Organisation.contact_name,
            NgoClassification.name,
        )
        .order_by(NgoClassification.name, func.sum(Donation.amount).desc())
        .all()
    )
    return [
        {
            "name": name,
            "country": country,
            "area": area_name or "Unclassified",
            "contact_name": contact_name,
            "total": float(total),
            "volunteer_hours": float(volunteer_hours),
            "logo_bytes": resolve_logo_bytes(logo_url),
        }
        for name, country, logo_url, contact_name, area_name, total, volunteer_hours in rows
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
    # "project-services" generates the card-based Annual Project Services Report.
    # Supports both format=pdf (A4 portrait) and format=pptx (16:9 landscape).
    # "simplified" and "integral" are kept for backward compatibility but
    # produce identical output since the Story 16.35 redesign.
    report_type: Literal["simplified", "integral", "project-services"] = Query("simplified", alias="type"),
    use_template: bool = Query(
        False,
        description="Story 16.35 redesign: PPTX chrome variant — the District "
        "3450 template band/logo (via a shipped static asset) instead of the "
        "plain green band + club logo. No longer needs an admin-uploaded PPT "
        "template file (see Admin → PPT Template) — that upload feature is "
        "unrelated to this toggle now.",
    ),
    rotary_year: int | None = Query(None, description="Defaults to the current rotary year"),
    classification_id: uuid.UUID | None = Query(None),
    currency: str | None = Query(
        None, description="Defaults to the first currency with any donations, same as the page"
    ),
    show_hours: bool = Query(False, description="Include volunteer hours per NGO in the report"),
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(NGOS_STATISTICS, "read")),
):
    stats = _compute_donation_statistics(db, rotary_year, classification_id)
    selected_currency = currency or (stats.by_currency[0].currency if stats.by_currency else None)

    # ── Project Services Report (card-based PDF or landscape PPTX) ─────────────
    if report_type == "project-services":
        ps_rows = _project_services_rows_for_year(db, stats.selected_rotary_year)
        chrome  = "template" if use_template else "plain"
        if report_format == "pptx":
            content    = build_project_services_pptx(ps_rows, stats.selected_rotary_year, chrome=chrome)
            media_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            filename   = generate_report_filename(
                "project-services", "pptx", rotary_year=stats.selected_rotary_year
            )
        else:
            content    = build_project_services_pdf(ps_rows, stats.selected_rotary_year)
            media_type = "application/pdf"
            filename   = generate_report_filename(
                "project-services", "pdf", rotary_year=stats.selected_rotary_year
            )
        return Response(
            content=content,
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    # ── Standard NGO statistics report (PDF table or PPTX slides) ───────────
    classification_org_ids = None
    if classification_id is not None:
        classification_org_ids = db.query(Organisation.id).filter(
            Organisation.classification_id == classification_id
        )
    ngo_rows = _ngo_report_rows_for_selected_year(
        db, stats.selected_rotary_year, selected_currency, classification_org_ids
    )

    if use_template and report_format != "pptx":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The district template chrome only applies to PowerPoint (PPTX) reports",
        )

    if report_format == "pdf":
        content = build_pdf_report(stats, selected_currency, ngo_rows, show_hours=show_hours)
        media_type = "application/pdf"
        filename = generate_report_filename(
            "ngo-statistics", "pdf", rotary_year=stats.selected_rotary_year
        )
    else:
        content = build_pptx_report(
            stats, selected_currency, ngo_rows, chrome="template" if use_template else "plain",
            show_hours=show_hours,
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


@router.post("/donations/statistics/comparison-report")
def generate_donation_comparison_report(
    year_a: int = Query(..., description="Older rotary year (shown top / slide 1)"),
    year_b: int = Query(..., description="Newer rotary year (shown bottom / slide 2)"),
    use_template: bool = Query(False, description="District 3450 template chrome"),
    currency: str | None = Query(None, description="Defaults to the first currency with any donations"),
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(NGOS_STATISTICS, "read")),
):
    """Year-over-year comparison PPTX.

    One slide when each year has ≤10 organisations, two slides (one per year)
    otherwise. Stat strip (Donated / Planned / Reach) always shown for year B.
    """
    if year_a == year_b:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="year_a and year_b must be different rotary years",
        )

    # Resolve currency — prefer year_b (the "current" year)
    if currency is None:
        stats_b_tmp = _compute_donation_statistics(db, year_b, None)
        selected_currency = stats_b_tmp.by_currency[0].currency if stats_b_tmp.by_currency else None
        if selected_currency is None:
            stats_a_tmp = _compute_donation_statistics(db, year_a, None)
            selected_currency = stats_a_tmp.by_currency[0].currency if stats_a_tmp.by_currency else None
    else:
        selected_currency = currency

    rows_a = _ngo_report_rows_for_selected_year(db, year_a, selected_currency, None)
    rows_b = _ngo_report_rows_for_selected_year(db, year_b, selected_currency, None)

    # Planned-donation total for year B (for the stat strip)
    planned_b_scalar = (
        db.query(func.sum(Donation.amount))
        .filter(
            Donation.rotary_year == year_b,
            Donation.planned.is_(True),
            Donation.currency == selected_currency,
        )
        .scalar()
    )
    # Actual (non-planned) donated total for year B
    total_donated_b = float(
        db.query(func.sum(Donation.amount))
        .filter(
            Donation.rotary_year == year_b,
            Donation.planned.is_(False),
            Donation.currency == selected_currency,
        )
        .scalar()
        or 0
    )

    # USD equivalent for the Donated card (only meaningful when primary currency is not USD)
    total_donated_usd = 0.0
    if selected_currency and selected_currency != "USD":
        rate_row = (
            db.query(ExchangeRate)
            .filter(ExchangeRate.currency_code == selected_currency)
            .first()
        )
        if rate_row and rate_row.rate_to_usd:
            total_donated_usd = total_donated_b * float(rate_row.rate_to_usd)

    stat_b = {
        "total": total_donated_b,
        "planned": float(planned_b_scalar or 0),
        "orgs": len(rows_b),
        "total_usd": total_donated_usd,
    }

    content = build_pptx_comparison_report(
        year_a, rows_a, year_b, rows_b,
        selected_currency,
        stat_b=stat_b,
        chrome="template" if use_template else "plain",
    )
    media_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    filename = generate_report_filename(
        "ngo-comparison", "pptx",
        rotary_year=max(year_a, year_b),
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
    if data.get("donation_date") is not None and "rotary_year" not in data:
        data["rotary_year"] = rotary_year(data["donation_date"])

    # Story 16.35: resolve what planned/donation_date will be *after* this
    # partial update is applied, and validate the combination — same rule as
    # DonationCreate, enforced here since PATCH only carries the changed
    # fields. Covers both directions: converting a planned donation to an
    # actual one (planned -> False + donation_date supplied) and editing an
    # already-actual donation (donation_date must stay set).
    resulting_planned = data.get("planned", donation.planned)
    resulting_date = data.get("donation_date", donation.donation_date)
    if resulting_planned:
        data["donation_date"] = None
    elif resulting_date is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="donation_date is required for an actual (non-planned) donation",
        )

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
