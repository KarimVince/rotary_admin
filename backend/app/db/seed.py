from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import Member, MemberTitle, User

DEFAULT_TITLES = [
    ("Rtn", "Rotarian", 0),
    ("P", "President", 1),
    ("PP", "Past President", 2),
    ("IPP", "Immediate Past President", 3),
    ("CP", "Charter President", 4),
]


def seed_member_titles(db):
    if db.query(MemberTitle).count() > 0:
        return
    for code, label, sort_order in DEFAULT_TITLES:
        db.add(MemberTitle(code=code, label=label, sort_order=sort_order))


def seed_admin_user(db):
    if db.query(User).filter(User.email == settings.admin_email).first():
        return
    db.add(
        User(
            email=settings.admin_email,
            hashed_password=hash_password(settings.admin_password),
            full_name=settings.admin_full_name,
            role="admin",
        )
    )


def seed_users_from_active_members(db):
    """Story 8.17: create a login for every active, non-honorary member that
    doesn't already have one. Honorary/past members are never given a login.
    Idempotent — safe to re-run (skips members with an existing user row by
    member_id or by email)."""
    already_linked_ids = {
        member_id
        for (member_id,) in db.query(User.member_id).filter(User.member_id.isnot(None))
    }
    active_members = (
        db.query(Member)
        .filter(Member.status == "active", Member.is_honorary.is_(False))
        .all()
    )

    created = 0
    skipped_existing = 0
    skipped_no_email = 0
    for member in active_members:
        if member.id in already_linked_ids:
            skipped_existing += 1
            continue
        if not member.email:
            skipped_no_email += 1
            continue
        if db.query(User).filter(User.email == member.email).first():
            skipped_existing += 1
            continue
        db.add(
            User(
                email=member.email,
                hashed_password=hash_password(settings.member_seed_password),
                full_name=f"{member.first_name} {member.last_name}",
                role="user",
                member_id=member.id,
            )
        )
        created += 1

    print(
        f"seed_users_from_active_members: {created} created, "
        f"{skipped_existing} already existed, {skipped_no_email} skipped (no email)"
    )


def run():
    db = SessionLocal()
    try:
        seed_member_titles(db)
        seed_admin_user(db)
        seed_users_from_active_members(db)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    run()
