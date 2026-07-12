from app.core.security import verify_password
from app.db.seed import seed_users_from_active_members
from app.models import User


def test_creates_user_for_active_non_honorary_member(db_session, make_member):
    member = make_member(email="active@example.com", status="active", is_honorary=False)

    seed_users_from_active_members(db_session)
    db_session.commit()

    user = db_session.query(User).filter(User.email == "active@example.com").first()
    assert user is not None
    assert user.member_id == member.id
    assert user.role == "user"
    assert verify_password("change-me", user.hashed_password)


def test_skips_honorary_member(db_session, make_member):
    make_member(email="honorary@example.com", status="active", is_honorary=True)

    seed_users_from_active_members(db_session)
    db_session.commit()

    assert db_session.query(User).filter(User.email == "honorary@example.com").first() is None


def test_skips_past_member(db_session, make_member):
    make_member(email="past@example.com", status="past", is_honorary=False)

    seed_users_from_active_members(db_session)
    db_session.commit()

    assert db_session.query(User).filter(User.email == "past@example.com").first() is None


def test_skips_member_without_email(db_session, make_member):
    before = db_session.query(User).count()

    seed_users_from_active_members(db_session)
    db_session.commit()

    assert db_session.query(User).count() == before


def test_idempotent_on_existing_user_for_member(db_session, make_member, make_user):
    member = make_member(email="already-linked@example.com", status="active", is_honorary=False)
    make_user(email="already-linked@example.com", member_id=member.id)
    before = db_session.query(User).count()

    seed_users_from_active_members(db_session)
    db_session.commit()

    assert db_session.query(User).count() == before


def test_idempotent_on_email_collision_without_member_link(db_session, make_member, make_user):
    member = make_member(email="collides@example.com", status="active", is_honorary=False)
    # A user already owns this email but isn't linked to the member yet.
    make_user(email="collides@example.com", member_id=None)
    before = db_session.query(User).count()

    seed_users_from_active_members(db_session)
    db_session.commit()

    assert db_session.query(User).count() == before
    assert db_session.query(User).filter(User.member_id == member.id).first() is None


def test_running_twice_does_not_duplicate(db_session, make_member):
    make_member(email="rerun@example.com", status="active", is_honorary=False)

    seed_users_from_active_members(db_session)
    db_session.commit()
    seed_users_from_active_members(db_session)
    db_session.commit()

    assert db_session.query(User).filter(User.email == "rerun@example.com").count() == 1
