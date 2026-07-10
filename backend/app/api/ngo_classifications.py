import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import require_access
from app.db.session import get_db
from app.models import NgoClassification, Organisation
from app.schemas.ngo_classification import (
    NgoClassificationCreate,
    NgoClassificationRead,
    NgoClassificationReorder,
    NgoClassificationUpdate,
)

router = APIRouter()

ADMIN_NGO_CLASSIFICATIONS = "admin.ngo_classifications"


def _get_classification_or_404(db: Session, classification_id: uuid.UUID) -> NgoClassification:
    classification = db.get(NgoClassification, classification_id)
    if classification is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Classification not found"
        )
    return classification


@router.get("/ngo-classifications", response_model=list[NgoClassificationRead])
def list_ngo_classifications(
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(ADMIN_NGO_CLASSIFICATIONS, "read")),
):
    classifications = db.query(NgoClassification).order_by(NgoClassification.position).all()
    counts = dict(
        db.query(Organisation.classification_id, func.count(Organisation.id))
        .filter(Organisation.classification_id.isnot(None))
        .group_by(Organisation.classification_id)
        .all()
    )
    results = []
    for classification in classifications:
        item = NgoClassificationRead.model_validate(classification)
        item.organisation_count = counts.get(classification.id, 0)
        results.append(item)
    return results


@router.post("/ngo-classifications", response_model=NgoClassificationRead, status_code=201)
def create_ngo_classification(
    payload: NgoClassificationCreate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(ADMIN_NGO_CLASSIFICATIONS, "write")),
):
    existing = db.query(NgoClassification).filter(NgoClassification.name == payload.name).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Classification name already exists"
        )

    max_position = db.query(func.max(NgoClassification.position)).scalar()
    classification = NgoClassification(
        name=payload.name,
        description=payload.description,
        position=0 if max_position is None else max_position + 1,
    )
    db.add(classification)
    db.commit()
    db.refresh(classification)
    return classification


@router.patch("/ngo-classifications/reorder", response_model=list[NgoClassificationRead])
def reorder_ngo_classifications(
    payload: NgoClassificationReorder,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(ADMIN_NGO_CLASSIFICATIONS, "write")),
):
    # Registered before "/{classification_id}" so the literal "reorder"
    # path segment isn't swallowed as a UUID path param.
    classifications = {c.id: c for c in db.query(NgoClassification).all()}
    for item in payload.items:
        classification = classifications.get(item.id)
        if classification is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Classification {item.id} not found",
            )
        classification.position = item.position

    db.commit()
    ordered = db.query(NgoClassification).order_by(NgoClassification.position).all()
    return ordered


@router.patch("/ngo-classifications/{classification_id}", response_model=NgoClassificationRead)
def update_ngo_classification(
    classification_id: uuid.UUID,
    payload: NgoClassificationUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(ADMIN_NGO_CLASSIFICATIONS, "write")),
):
    classification = _get_classification_or_404(db, classification_id)

    update_data = payload.model_dump(exclude_unset=True)
    if update_data.get("name") is not None:
        existing = (
            db.query(NgoClassification)
            .filter(
                NgoClassification.name == update_data["name"],
                NgoClassification.id != classification_id,
            )
            .first()
        )
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Classification name already exists"
            )

    for field, value in update_data.items():
        setattr(classification, field, value)

    db.commit()
    db.refresh(classification)
    return classification


@router.patch("/ngo-classifications/reorder", response_model=list[NgoClassificationRead])
def reorder_ngo_classifications(
    payload: NgoClassificationReorder,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(ADMIN_NGO_CLASSIFICATIONS, "write")),
):
    classifications = {c.id: c for c in db.query(NgoClassification).all()}
    for item in payload.items:
        classification = classifications.get(item.id)
        if classification is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Classification {item.id} not found",
            )
        classification.position = item.position

    db.commit()
    ordered = db.query(NgoClassification).order_by(NgoClassification.position).all()
    return ordered


@router.delete("/ngo-classifications/{classification_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ngo_classification(
    classification_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(ADMIN_NGO_CLASSIFICATIONS, "write")),
):
    """Hard delete (Story 11.1) — the FK's ON DELETE SET NULL leaves any
    organisation currently using this classification unclassified rather
    than blocking the delete or removing the organisation."""
    classification = _get_classification_or_404(db, classification_id)
    db.delete(classification)
    db.commit()
    return None
