from datetime import date
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.core.access_control import clear_access_cache
from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.db.session import get_db
from app.main import app
from app.models import (
    AppFunction,
    BoardPosition,
    BoardPositionAssignment,
    ExchangeRate,
    FeeSettings,
    Member,
    MemberFee,
    Organisation,
    PermissionMatrix,
    RotaryFriend,
    User,
)

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


@pytest.fixture(autouse=True)
def _reset_access_cache():
    # The access-control resolution cache (Story 9.4) is process-global, so
    # without this a cache hit from an earlier test could leak into another
    # test that reuses the same user/function-key pair.
    clear_access_cache()
    yield
    clear_access_cache()


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
        leave_date: date | None = None,
        status: str = "active",
        is_couple: bool = False,
        is_honorary: bool = False,
    ) -> Member:
        member = Member(
            first_name=first_name,
            last_name=last_name,
            email=email,
            join_date=join_date or date(2020, 1, 1),
            leave_date=leave_date,
            status=status,
            is_couple=is_couple,
            is_honorary=is_honorary,
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


@pytest.fixture
def make_fee_settings(db_session):
    def _make_fee_settings(
        rotary_year: int = 2025,
        early_bird_single_price: float = 500,
        early_bird_couple_price: float = 900,
        full_single_price: float = 600,
        full_couple_price: float = 1000,
        currency: str = "HKD",
    ) -> FeeSettings:
        fee_settings = FeeSettings(
            rotary_year=rotary_year,
            early_bird_single_price=early_bird_single_price,
            early_bird_couple_price=early_bird_couple_price,
            full_single_price=full_single_price,
            full_couple_price=full_couple_price,
            currency=currency,
        )
        db_session.add(fee_settings)
        db_session.commit()
        db_session.refresh(fee_settings)
        return fee_settings

    return _make_fee_settings


@pytest.fixture
def make_member_fee(db_session):
    def _make_member_fee(
        member_id,
        rotary_year: int = 2025,
        price_type: str = "early_bird",
        is_couple_at_billing: bool = False,
        amount_due: float = 500,
        is_paid: bool = False,
        amount_paid: float | None = None,
    ) -> MemberFee:
        member_fee = MemberFee(
            member_id=member_id,
            rotary_year=rotary_year,
            price_type=price_type,
            is_couple_at_billing=is_couple_at_billing,
            amount_due=amount_due,
            is_paid=is_paid,
            amount_paid=amount_paid,
        )
        db_session.add(member_fee)
        db_session.commit()
        db_session.refresh(member_fee)
        return member_fee

    return _make_member_fee


@pytest.fixture
def make_board_position(db_session):
    def _make_board_position(
        name: str = "President",
        description: str | None = None,
        display_order: int = 0,
        active: bool = True,
    ) -> BoardPosition:
        # Get-or-create: Story 12.10 seeds real board positions (President/
        # Treasurer/Secretary) via migration, so tests using those names as
        # defaults would otherwise collide with the unique `name` constraint.
        existing = db_session.query(BoardPosition).filter(BoardPosition.name == name).first()
        if existing is not None:
            existing.description = description
            existing.display_order = display_order
            existing.active = active
            db_session.commit()
            db_session.refresh(existing)
            return existing

        board_position = BoardPosition(
            name=name, description=description, display_order=display_order, active=active
        )
        db_session.add(board_position)
        db_session.commit()
        db_session.refresh(board_position)
        return board_position

    return _make_board_position


@pytest.fixture
def make_board_position_assignment(db_session):
    def _make_board_position_assignment(
        board_position_id,
        member_id,
        rotary_year: int = 2025,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> BoardPositionAssignment:
        assignment = BoardPositionAssignment(
            board_position_id=board_position_id,
            member_id=member_id,
            rotary_year=rotary_year,
            start_date=start_date or date(rotary_year, 7, 1),
            end_date=end_date,
        )
        db_session.add(assignment)
        db_session.commit()
        db_session.refresh(assignment)
        return assignment

    return _make_board_position_assignment


@pytest.fixture
def make_app_function(db_session):
    def _make_app_function(
        key: str = "members",
        label: str = "Members",
        module: str = "members",
        parent_id=None,
        display_order: int = 0,
        active: bool = True,
    ) -> AppFunction:
        # Get-or-create: Epic 12's migrations seed the real 22-row Menu/
        # Submenu tree, so tests using those real keys (e.g. "members",
        # "members.directory") as defaults would otherwise collide with the
        # unique `key` constraint.
        existing = db_session.query(AppFunction).filter(AppFunction.key == key).first()
        if existing is not None:
            existing.label = label
            existing.module = module
            existing.parent_id = parent_id
            existing.display_order = display_order
            existing.active = active
            db_session.commit()
            db_session.refresh(existing)
            return existing

        app_function = AppFunction(
            key=key,
            label=label,
            module=module,
            parent_id=parent_id,
            display_order=display_order,
            active=active,
        )
        db_session.add(app_function)
        db_session.commit()
        db_session.refresh(app_function)
        return app_function

    return _make_app_function


@pytest.fixture
def make_permission_matrix_entry(db_session):
    def _make_permission_matrix_entry(
        app_function_id,
        board_position_id=None,
        access_level: str = "read",
        is_default_user: bool = False,
    ) -> PermissionMatrix:
        # Get-or-create: Story 12.10 seeds a default permission matrix for
        # every real app_function/board_position, so tests reusing those
        # seeded rows (via make_app_function's/make_board_position's own
        # get-or-create) need to overwrite the existing cell rather than
        # violate the unique constraints on it.
        query = db_session.query(PermissionMatrix).filter(
            PermissionMatrix.app_function_id == app_function_id
        )
        if is_default_user:
            query = query.filter(PermissionMatrix.is_default_user.is_(True))
        else:
            query = query.filter(PermissionMatrix.board_position_id == board_position_id)
        existing = query.first()
        if existing is not None:
            existing.access_level = access_level
            db_session.commit()
            db_session.refresh(existing)
            return existing

        entry = PermissionMatrix(
            board_position_id=board_position_id,
            app_function_id=app_function_id,
            access_level=access_level,
            is_default_user=is_default_user,
        )
        db_session.add(entry)
        db_session.commit()
        db_session.refresh(entry)
        return entry

    return _make_permission_matrix_entry


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
