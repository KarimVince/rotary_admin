import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.core.config import settings
from app.core.currency_conversion import convert_totals
from app.db.session import get_db
from app.models import Donation, ExchangeRate, Organisation
from app.schemas.organisation import OrganisationCreate, OrganisationRead, OrganisationUpdate

router = APIRouter()

NGOS_ORGANISATIONS = "ngos.organisations"

LOGO_CONTENT_TYPE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_LOGO_BYTES = 2 * 1024 * 1024


@router.get("/organisations", response_model=list[OrganisationRead])
def list_organisations(
    search: str | None = Query(None, description="Case-insensitive match on name or country"),
    rotary_year: int | None = Query(
        None,
        description="Only include organisations with a donation in this rotary year; "
        "each result gets a year_total (HKD, best-effort converted)",
    ),
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(NGOS_ORGANISATIONS, "read")),
):
    if rotary_year is not None:
        org_ids_with_donation = db.query(Donation.organisation_id).filter(
            Donation.rotary_year == rotary_year
        )
        query = db.query(Organisation).filter(Organisation.id.in_(org_ids_with_donation))
    else:
        query = db.query(Organisation)

    if search:
        term = f"%{search}%"
        query = query.filter(
            or_(Organisation.name.ilike(term), Organisation.country.ilike(term))
        )
    organisations = query.order_by(Organisation.name).all()

    if rotary_year is None:
        return organisations

    rates = {
        rate.currency_code: (float(rate.rate_to_hkd), float(rate.rate_to_usd))
        for rate in db.query(ExchangeRate).all()
    }
    rows_by_org: dict[uuid.UUID, list[tuple[str, float]]] = {}
    for org_id, currency, amount in db.query(
        Donation.organisation_id, Donation.currency, Donation.amount
    ).filter(Donation.rotary_year == rotary_year):
        rows_by_org.setdefault(org_id, []).append((currency, float(amount)))

    results = []
    for organisation in organisations:
        item = OrganisationRead.model_validate(organisation)
        item.year_total = convert_totals(rows_by_org.get(organisation.id, []), rates)[
            "total_hkd"
        ]
        results.append(item)
    return results


@router.post("/organisations", response_model=OrganisationRead, status_code=201)
def create_organisation(
    payload: OrganisationCreate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(NGOS_ORGANISATIONS, "write")),
):
    organisation = Organisation(**payload.model_dump())
    db.add(organisation)
    db.commit()
    db.refresh(organisation)
    return organisation


@router.post("/organisations/logo", status_code=status.HTTP_201_CREATED)
async def upload_organisation_logo(
    file: UploadFile = File(...),
    _current_user=Depends(require_access(NGOS_ORGANISATIONS, "write")),
):
    extension = LOGO_CONTENT_TYPE_EXTENSIONS.get(file.content_type)
    if extension is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Logo must be a JPEG, PNG, or WEBP image",
        )

    contents = await file.read()
    if len(contents) > MAX_LOGO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Logo must be smaller than 2MB",
        )

    filename = f"{uuid.uuid4().hex}{extension}"
    upload_dir = Path(settings.upload_dir) / "organisations"
    upload_dir.mkdir(parents=True, exist_ok=True)
    (upload_dir / filename).write_bytes(contents)

    return {"logo_url": f"/static/organisations/{filename}"}


@router.get("/organisations/{organisation_id}", response_model=OrganisationRead)
def get_organisation(
    organisation_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(NGOS_ORGANISATIONS, "read")),
):
    organisation = db.get(Organisation, organisation_id)
    if organisation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Organisation not found"
        )
    return organisation


@router.patch("/organisations/{organisation_id}", response_model=OrganisationRead)
def update_organisation(
    organisation_id: uuid.UUID,
    payload: OrganisationUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(NGOS_ORGANISATIONS, "write")),
):
    organisation = db.get(Organisation, organisation_id)
    if organisation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Organisation not found"
        )

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(organisation, field, value)

    db.commit()
    db.refresh(organisation)
    return organisation


@router.delete("/organisations/{organisation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_organisation(
    organisation_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(NGOS_ORGANISATIONS, "write")),
):
    """Hard delete. Any donations tied to this organisation are removed too
    via the ON DELETE CASCADE on donations.organisation_id."""
    organisation = db.get(Organisation, organisation_id)
    if organisation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Organisation not found"
        )

    db.delete(organisation)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
