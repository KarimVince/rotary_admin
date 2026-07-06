import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin
from app.db.session import get_db
from app.models import Organisation
from app.schemas.organisation import OrganisationCreate, OrganisationRead, OrganisationUpdate

router = APIRouter()


@router.get("/organisations", response_model=list[OrganisationRead])
def list_organisations(
    search: str | None = Query(None, description="Case-insensitive match on name or country"),
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    query = db.query(Organisation)
    if search:
        term = f"%{search}%"
        query = query.filter(
            or_(Organisation.name.ilike(term), Organisation.country.ilike(term))
        )
    return query.order_by(Organisation.name).all()


@router.post("/organisations", response_model=OrganisationRead, status_code=201)
def create_organisation(
    payload: OrganisationCreate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_admin),
):
    organisation = Organisation(**payload.model_dump())
    db.add(organisation)
    db.commit()
    db.refresh(organisation)
    return organisation


@router.get("/organisations/{organisation_id}", response_model=OrganisationRead)
def get_organisation(
    organisation_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
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
    _current_user=Depends(require_admin),
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
    _current_user=Depends(require_admin),
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
