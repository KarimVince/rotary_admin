import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_access, require_admin
from app.core.access_control import clear_access_cache, get_access
from app.core.rotary_year import rotary_year
from app.db.session import get_db
from app.models import AppFunction, BoardPosition, BoardPositionAssignment, Member, PermissionMatrix
from app.schemas.app_function import AppFunctionRead
from app.schemas.board_position import BoardPositionCreate, BoardPositionRead, BoardPositionUpdate
from app.schemas.board_position_assignment import (
    BoardPositionAssignmentCreate,
    BoardPositionAssignmentRead,
    BoardPositionAssignmentUpdate,
)
from app.schemas.permission_matrix import (
    PermissionMatrixCellUpsert,
    PermissionMatrixCellUpsertResult,
    PermissionMatrixEntryRead,
)

# Story 12.7: board.members re-points the old hyphenated keys; board.positions
# is newly delegable (previously hardcoded require_admin).
BOARD_MEMBERS = "board.members"
BOARD_POSITIONS = "board.positions"

_ACCESS_LEVEL_ORDER = {"no_access": 0, "read": 1, "write": 2}

# Story 16.7: these three positions are always board seats — "at_the_board"
# is force-true and non-editable for them, regardless of what the client sends.
_ALWAYS_AT_THE_BOARD = {"president", "treasurer", "secretary"}

router = APIRouter()


def _find_by_name_case_insensitive(db: Session, name: str, exclude_id: uuid.UUID | None = None):
    query = db.query(BoardPosition).filter(func.lower(BoardPosition.name) == name.lower())
    if exclude_id is not None:
        query = query.filter(BoardPosition.id != exclude_id)
    return query.first()


@router.get("/board/positions", response_model=list[BoardPositionRead])
def list_board_positions(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    query = db.query(BoardPosition)
    if not include_inactive:
        query = query.filter(BoardPosition.active.is_(True))
    return query.order_by(BoardPosition.display_order).all()


@router.post("/board/positions", response_model=BoardPositionRead, status_code=201)
def create_board_position(
    payload: BoardPositionCreate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(BOARD_POSITIONS, "write")),
):
    if _find_by_name_case_insensitive(db, payload.name) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Position name already exists"
        )

    data = payload.model_dump()
    if data["name"].strip().lower() in _ALWAYS_AT_THE_BOARD:
        data["at_the_board"] = True
    position = BoardPosition(**data)
    db.add(position)
    db.commit()
    db.refresh(position)
    return position


@router.patch("/board/positions/{position_id}", response_model=BoardPositionRead)
def update_board_position(
    position_id: uuid.UUID,
    payload: BoardPositionUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(BOARD_POSITIONS, "write")),
):
    position = db.get(BoardPosition, position_id)
    if position is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Position not found")

    update_data = payload.model_dump(exclude_unset=True)

    if update_data.get("name") is not None:
        if _find_by_name_case_insensitive(db, update_data["name"], exclude_id=position_id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Position name already exists"
            )

    for field, value in update_data.items():
        setattr(position, field, value)

    if position.name.strip().lower() in _ALWAYS_AT_THE_BOARD:
        position.at_the_board = True

    db.commit()
    db.refresh(position)
    if "active" in update_data:
        clear_access_cache()
    return position


@router.delete("/board/positions/{position_id}", response_model=BoardPositionRead)
def deactivate_board_position(
    position_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(BOARD_POSITIONS, "write")),
):
    """Soft delete: deactivates the position rather than removing the row, since
    historical assignments and permission matrix entries may still reference it."""
    position = db.get(BoardPosition, position_id)
    if position is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Position not found")

    position.active = False
    db.commit()
    db.refresh(position)
    clear_access_cache()
    return position


@router.get("/board/positions/{position_id}/assignment-count")
def get_board_position_assignment_count(
    position_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(BOARD_POSITIONS, "read")),
):
    """Story 12.12: lets the UI warn before a hard delete how many members
    currently hold this position (active assignment for the current rotary
    year) will lose that assignment."""
    position = db.get(BoardPosition, position_id)
    if position is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Position not found")

    count = (
        db.query(BoardPositionAssignment)
        .filter(
            BoardPositionAssignment.board_position_id == position_id,
            BoardPositionAssignment.rotary_year == rotary_year(date.today()),
            BoardPositionAssignment.end_date.is_(None),
        )
        .count()
    )
    return {"count": count}


@router.delete("/board/positions/{position_id}/permanent", status_code=status.HTTP_204_NO_CONTENT)
def hard_delete_board_position(
    position_id: uuid.UUID,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(BOARD_POSITIONS, "write")),
):
    """Story 12.12: permanently removes a position definition — distinct from
    the soft-delete (deactivate) endpoint above, which preserves history.
    Board position assignments and permission_matrix rows referencing this
    position cascade-delete at the DB level (ON DELETE CASCADE)."""
    position = db.get(BoardPosition, position_id)
    if position is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Position not found")

    db.delete(position)
    db.commit()
    clear_access_cache()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _build_assignment_read(assignment, board_position, member) -> BoardPositionAssignmentRead:
    return BoardPositionAssignmentRead(
        id=assignment.id,
        board_position_id=assignment.board_position_id,
        member_id=assignment.member_id,
        rotary_year=assignment.rotary_year,
        start_date=assignment.start_date,
        end_date=assignment.end_date,
        created_by=assignment.created_by,
        created_at=assignment.created_at,
        board_position=board_position,
        member=member,
    )


@router.get("/board/assignments", response_model=list[BoardPositionAssignmentRead])
def list_board_position_assignments(
    year: int = Query(...),
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(BOARD_MEMBERS, "read")),
):
    rows = (
        db.query(BoardPositionAssignment, BoardPosition, Member)
        .join(BoardPosition, BoardPositionAssignment.board_position_id == BoardPosition.id)
        .join(Member, BoardPositionAssignment.member_id == Member.id)
        .filter(BoardPositionAssignment.rotary_year == year)
        .order_by(BoardPosition.display_order, BoardPositionAssignment.created_at)
        .all()
    )
    return [_build_assignment_read(*row) for row in rows]


@router.post("/board/assignments", response_model=BoardPositionAssignmentRead, status_code=201)
def create_board_position_assignment(
    payload: BoardPositionAssignmentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_access(BOARD_MEMBERS, "write")),
):
    position = db.get(BoardPosition, payload.board_position_id)
    if position is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Board position not found")

    member = db.get(Member, payload.member_id)
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    current_year = rotary_year(date.today())
    today = date.today()

    existing = (
        db.query(BoardPositionAssignment)
        .filter(
            BoardPositionAssignment.board_position_id == payload.board_position_id,
            BoardPositionAssignment.rotary_year == current_year,
            BoardPositionAssignment.end_date.is_(None),
        )
        .first()
    )
    if existing is not None:
        # History preserved, not overwritten: the prior holder's row is closed
        # out rather than deleted or reused.
        existing.end_date = today

    assignment = BoardPositionAssignment(
        board_position_id=payload.board_position_id,
        member_id=payload.member_id,
        rotary_year=current_year,
        # Board terms always start July 1st of the rotary year, regardless of
        # the actual date the assignment is recorded.
        start_date=date(current_year, 7, 1),
        end_date=None,
        created_by=current_user.id,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    clear_access_cache()
    return _build_assignment_read(assignment, position, member)


@router.patch("/board/assignments/{assignment_id}", response_model=BoardPositionAssignmentRead)
def update_board_position_assignment(
    assignment_id: uuid.UUID,
    payload: BoardPositionAssignmentUpdate,
    db: Session = Depends(get_db),
    _current_user=Depends(require_access(BOARD_MEMBERS, "write")),
):
    assignment = db.get(BoardPositionAssignment, assignment_id)
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(assignment, field, value)

    db.commit()
    db.refresh(assignment)
    clear_access_cache()

    position = db.get(BoardPosition, assignment.board_position_id)
    member = db.get(Member, assignment.member_id)
    return _build_assignment_read(assignment, position, member)


@router.get("/board/app-functions", response_model=list[AppFunctionRead])
def list_app_functions(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    query = db.query(AppFunction)
    if not include_inactive:
        query = query.filter(AppFunction.active.is_(True))
    return query.order_by(AppFunction.display_order).all()


def _build_matrix_entry(matrix_entry, board_position, app_function) -> PermissionMatrixEntryRead:
    return PermissionMatrixEntryRead(
        id=matrix_entry.id,
        board_position_id=matrix_entry.board_position_id,
        app_function_id=matrix_entry.app_function_id,
        access_level=matrix_entry.access_level,
        is_default_user=matrix_entry.is_default_user,
        board_position=board_position,
        app_function=app_function,
    )


@router.get("/board/permissions/matrix", response_model=list[PermissionMatrixEntryRead])
def get_permission_matrix(
    db: Session = Depends(get_db),
    _current_user=Depends(get_current_user),
):
    rows = (
        db.query(PermissionMatrix, BoardPosition, AppFunction)
        .join(AppFunction, PermissionMatrix.app_function_id == AppFunction.id)
        .outerjoin(BoardPosition, PermissionMatrix.board_position_id == BoardPosition.id)
        .order_by(AppFunction.display_order, BoardPosition.display_order)
        .all()
    )
    return [_build_matrix_entry(*row) for row in rows]


def _matrix_entry_for(db: Session, app_function_id: uuid.UUID, board_position_id: uuid.UUID | None):
    query = db.query(PermissionMatrix).filter(PermissionMatrix.app_function_id == app_function_id)
    if board_position_id is None:
        query = query.filter(PermissionMatrix.is_default_user.is_(True))
    else:
        query = query.filter(PermissionMatrix.board_position_id == board_position_id)
    return query.first()


@router.put("/board/permissions/matrix/cell", response_model=PermissionMatrixCellUpsertResult)
def upsert_permission_matrix_cell(
    payload: PermissionMatrixCellUpsert,
    db: Session = Depends(get_db),
    _current_user=Depends(require_admin),
):
    app_function = db.get(AppFunction, payload.app_function_id)
    if app_function is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="App function not found")

    board_position = None
    if payload.board_position_id is not None:
        board_position = db.get(BoardPosition, payload.board_position_id)
        if board_position is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Board position not found"
            )

    # Rule 1: a Submenu cell can never exceed its parent Menu's level for the
    # same column. A missing parent row is treated as No Access.
    if app_function.parent_id is not None:
        parent_entry = _matrix_entry_for(db, app_function.parent_id, payload.board_position_id)
        parent_level = parent_entry.access_level if parent_entry is not None else "no_access"
        if _ACCESS_LEVEL_ORDER[payload.access_level] > _ACCESS_LEVEL_ORDER[parent_level]:
            parent_function = db.get(AppFunction, app_function.parent_id)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot grant '{payload.access_level}' on '{app_function.label}' — "
                    f"its parent menu '{parent_function.label}' is limited to '{parent_level}' "
                    "for this column."
                ),
            )

    entry = _matrix_entry_for(db, payload.app_function_id, payload.board_position_id)
    if entry is None:
        entry = PermissionMatrix(
            app_function_id=payload.app_function_id,
            board_position_id=payload.board_position_id,
            is_default_user=payload.board_position_id is None,
            access_level=payload.access_level,
        )
        db.add(entry)
    else:
        entry.access_level = payload.access_level

    # Rule 2: lowering a Menu cell auto-cascade-clamps any of its submenus
    # currently set above the new level, in the same transaction.
    cascaded_entries: list[PermissionMatrix] = []
    if app_function.parent_id is None:
        submenus = (
            db.query(AppFunction)
            .filter(AppFunction.parent_id == app_function.id, AppFunction.active.is_(True))
            .all()
        )
        for submenu in submenus:
            submenu_entry = _matrix_entry_for(db, submenu.id, payload.board_position_id)
            if submenu_entry is not None and (
                _ACCESS_LEVEL_ORDER[submenu_entry.access_level]
                > _ACCESS_LEVEL_ORDER[payload.access_level]
            ):
                submenu_entry.access_level = payload.access_level
                cascaded_entries.append((submenu_entry, submenu))

    db.commit()
    db.refresh(entry)
    for submenu_entry, _submenu in cascaded_entries:
        db.refresh(submenu_entry)
    clear_access_cache()

    return PermissionMatrixCellUpsertResult(
        entry=_build_matrix_entry(entry, board_position, app_function),
        cascaded=[
            _build_matrix_entry(submenu_entry, board_position, submenu)
            for submenu_entry, submenu in cascaded_entries
        ],
    )


@router.get("/board/permissions/me", response_model=dict[str, str])
def get_my_permissions(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    app_functions = db.query(AppFunction).filter(AppFunction.active.is_(True)).all()
    return {fn.key: get_access(db, current_user, fn.key) for fn in app_functions}
