"""Story 12.10 — seed the default Board Position catalogue and permission
matrix. Replaces Epic 9's Story 9.9 seed, which never matched what Epic 9
actually shipped.

A standalone, idempotent script (not an Alembic migration) — same pattern as
`Data/import_members.py`. Deliberately kept out of the migration chain so it
never runs automatically against the test database, which needs to stay
seed-free so tests can assert on exact row counts. Run it manually once per
environment (dev, and again after the prod database is provisioned in
Epic 6):

    cd backend && python -m scripts.seed_permission_matrix

Safe to re-run: every insert is idempotent (ON CONFLICT DO NOTHING / a no-op
update), so running it twice against the same database is a no-op the second
time.
"""
import uuid

from sqlalchemy import text

from app.db.session import SessionLocal

# name -> display_order
BOARD_POSITIONS = [
    ("President", 1),
    # Story 10.10: added for the Dinner Attendance write tier (Secretary /
    # President / President Elect) — wasn't needed by any module before Epic 10.
    ("President Elect", 2),
    ("Treasurer", 3),
    ("Secretary", 4),
]

# function_key -> (default_user_level, {position_name: level, ... "*": level})
# "*" is shorthand for "every named position gets this level unless
# overridden by a more specific entry".
DEFAULT_MATRIX = {
    "members": ("read", {"*": "write"}),
    "members.directory": ("read", {"*": "write"}),
    "members.statistics": ("read", {"*": "write"}),
    "members.email": ("no_access", {"*": "write"}),
    "ngos": ("read", {"*": "write"}),
    "ngos.organisations": ("read", {"*": "write"}),
    "ngos.statistics": ("read", {"*": "write"}),
    "fees": ("no_access", {"*": "write"}),
    "fees.tracking": ("no_access", {"*": "write"}),
    "fees.run": ("no_access", {"*": "write"}),
    "fees.settings": ("no_access", {"*": "write"}),
    "fees.statistics": ("no_access", {"*": "write"}),
    "friends": ("write", {"*": "write"}),
    "friends.directory": ("write", {"*": "write"}),
    "friends.statistics": ("write", {"*": "write"}),
    "friends.send_message": (
        "read",
        {"President": "write", "Secretary": "write", "Treasurer": "no_access"},
    ),
    "board": ("read", {"*": "write"}),
    "board.members": ("read", {"*": "write"}),
    "board.positions": ("no_access", {"*": "no_access"}),
    "admin": ("no_access", {"*": "no_access"}),
    "admin.member_titles": ("no_access", {"*": "no_access"}),
    "admin.currencies": ("no_access", {"*": "no_access"}),
    # Story 10.10 — Secretary / President / President Elect can create events
    # and mark attendance; every other board position and the default
    # (non-board) user get read-only, per Story 10.6's permission matrix.
    "attendance": (
        "read",
        {"President": "write", "President Elect": "write", "Secretary": "write", "*": "read"},
    ),
    "attendance.history": (
        "read",
        {"President": "write", "President Elect": "write", "Secretary": "write", "*": "read"},
    ),
    "attendance.sheet": (
        "read",
        {"President": "write", "President Elect": "write", "Secretary": "write", "*": "read"},
    ),
}


def run() -> None:
    db = SessionLocal()
    try:
        # 1. Board Position definitions — idempotent (unique on name).
        position_ids: dict[str, uuid.UUID] = {}
        for name, order in BOARD_POSITIONS:
            row = db.execute(
                text(
                    """
                    INSERT INTO board_positions (id, name, display_order, active)
                    VALUES (gen_random_uuid(), :name, :order, true)
                    ON CONFLICT (name) DO UPDATE SET name = board_positions.name
                    RETURNING id
                    """
                ),
                {"name": name, "order": order},
            ).first()
            position_ids[name] = row[0]

        # 2. Default permission matrix — idempotent (unique constraints on
        #    (board_position_id, app_function_id) and the default-user
        #    partial index already guard against duplicate rows).
        for function_key, (default_level, position_levels) in DEFAULT_MATRIX.items():
            app_function_row = db.execute(
                text("SELECT id FROM app_functions WHERE key = :key"),
                {"key": function_key},
            ).first()
            if app_function_row is None:
                print(f"skip {function_key}: no app_functions row (run migrations first)")
                continue
            app_function_id = app_function_row[0]

            db.execute(
                text(
                    """
                    INSERT INTO permission_matrix
                        (id, board_position_id, app_function_id, access_level, is_default_user)
                    VALUES (gen_random_uuid(), NULL, :app_function_id, :level, true)
                    ON CONFLICT (app_function_id) WHERE (is_default_user = true)
                        DO NOTHING
                    """
                ),
                {"app_function_id": app_function_id, "level": default_level},
            )

            wildcard_level = position_levels.get("*")
            for position_name, position_id in position_ids.items():
                level = position_levels.get(position_name, wildcard_level)
                if level is None:
                    continue
                db.execute(
                    text(
                        """
                        INSERT INTO permission_matrix
                            (id, board_position_id, app_function_id, access_level, is_default_user)
                        VALUES (gen_random_uuid(), :board_position_id, :app_function_id, :level, false)
                        ON CONFLICT (board_position_id, app_function_id) DO NOTHING
                        """
                    ),
                    {
                        "board_position_id": position_id,
                        "app_function_id": app_function_id,
                        "level": level,
                    },
                )

        db.commit()
        print("Default board positions and permission matrix seeded.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
