from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import MemberTitle, User

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


def run():
    db = SessionLocal()
    try:
        seed_member_titles(db)
        seed_admin_user(db)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    run()
