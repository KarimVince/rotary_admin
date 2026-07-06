from datetime import date
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.db.session import get_db
from app.main import app
from app.models import ExchangeRate, Member, Organisation, RotaryFriend, User

BACKEND_DIR = Path(__file__).resolve().parent.parent
TEST_DATABASE_URL = settings.database_url.rsplit("/", 1)[0] + "/rotary_admin_test"


def _ensure_test_database_exists() -> None:
    db_name = TEST_DATABASE_URL.rsplit("/", 1)[1]
    admin_url = settings.database_url.rsplit("/", 1)[0] + "/postgres"
    admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": db_name}
        ).scalar()
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{db_name}"'))
    admin_engine.dispose()


@pytest.fixture(scope="session")
def test_engine():
    _ensure_test_database_exists()

    alembic_cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    alembic_cfg.attributes["sqlalchemy.url"] = TEST_DATABASE_URL
    command.upgrade(alembic_cfg, "head")

    engine = create_engine(TEST_DATABASE_URL)
    yield engine
    engine.dispose()


@pytest.fixture
def db_session(test_engine):
    connection = test_engine.connect()
    outer_transaction = connection.begin()
    session_factory = sessionmaker(bind=connection, join_transaction_mode="create_savepoint")
    session = session_factory()

    yield session

    session.close()
    outer_transaction.rollback()
    connection.close()


@pytest.fixture
def client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def make_user(db_session):
    def _make_user(
        email: str = "user@example.com",
        password: str = "password123",
        full_name: str = "Test User",
        role: str = "user",
        is_active: bool = True,
        member_id=None,
    ) -> User:
        user = User(
            email=email,
            hashed_password=hash_password(password),
            full_name=full_name,
            role=role,
            is_active=is_active,
            member_id=member_id,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        return user

    return _make_user


@pytest.fixture
def make_member(db_session):
    def _make_member(
        first_name: str = "Jane",
        last_name: str = "Doe",
        email: str | None = None,
        join_date: date | None = None,
    ) -> Member:
        member = Member(
            first_name=first_name,
            last_name=last_name,
            email=email,
            join_date=join_date or date(2020, 1, 1),
        )
        db_session.add(member)
        db_session.commit()
        db_session.refresh(member)
        return member

    return _make_member


@pytest.fixture
def make_organisation(db_session):
    def _make_organisation(name: str = "Test Org", country: str = "France") -> Organisation:
        organisation = Organisation(name=name, country=country)
        db_session.add(organisation)
        db_session.commit()
        db_session.refresh(organisation)
        return organisation

    return _make_organisation


@pytest.fixture
def make_exchange_rate(db_session):
    def _make_exchange_rate(
        currency_code: str = "EUR", rate_to_hkd: float = 8.5, rate_to_usd: float = 1.09
    ) -> ExchangeRate:
        rate = ExchangeRate(
            currency_code=currency_code, rate_to_hkd=rate_to_hkd, rate_to_usd=rate_to_usd
        )
        db_session.add(rate)
        db_session.commit()
        db_session.refresh(rate)
        return rate

    return _make_exchange_rate


@pytest.fixture
def make_rotary_friend(db_session):
    def _make_rotary_friend(
        first_name: str = "Alex",
        last_name: str = "Friend",
        email: str | None = "friend@example.com",
    ) -> RotaryFriend:
        friend = RotaryFriend(first_name=first_name, last_name=last_name, email=email)
        db_session.add(friend)
        db_session.commit()
        db_session.refresh(friend)
        return friend

    return _make_rotary_friend


def _build_authenticated_client(db_session, user: User) -> TestClient:
    # Each role-client fixture gets its own TestClient instance (rather than
    # sharing/mutating the base `client` fixture's headers) so that a single
    # test can safely request e.g. both admin_client and user_client without
    # one's Authorization header silently overwriting the other's.
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    test_client = TestClient(app)
    token = create_access_token(str(user.id), user.role)
    test_client.headers.update({"Authorization": f"Bearer {token}"})
    return test_client


@pytest.fixture
def admin_client(db_session, make_user):
    user = make_user(email="admin-fixture@example.com", role="admin")
    return _build_authenticated_client(db_session, user)


@pytest.fixture
def treasurer_client(db_session, make_user):
    user = make_user(email="treasurer-fixture@example.com", role="treasurer")
    return _build_authenticated_client(db_session, user)


@pytest.fixture
def user_client(db_session, make_user):
    user = make_user(email="user-fixture@example.com", role="user")
    return _build_authenticated_client(db_session, user)


@pytest.fixture
def build_client(db_session):
    def _build(user: User) -> TestClient:
        return _build_authenticated_client(db_session, user)

    return _build
