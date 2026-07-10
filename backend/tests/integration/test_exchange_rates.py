import pytest

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def _grant_default_currencies_read(make_app_function, make_permission_matrix_entry):
    # Story 12.7: reads are matrix-gated now (admin.currencies).
    app_function = make_app_function(key="admin.currencies", label="Admin — Currencies")
    make_permission_matrix_entry(
        app_function.id, board_position_id=None, access_level="read", is_default_user=True
    )


def test_hkd_and_usd_are_seeded_with_self_rate(admin_client):
    response = admin_client.get("/api/v1/exchange-rates")
    assert response.status_code == 200
    by_code = {rate["currency_code"]: rate for rate in response.json()}

    assert by_code["HKD"]["rate_to_hkd"] == 1.0
    assert by_code["USD"]["rate_to_usd"] == 1.0


def test_list_exchange_rates_requires_authentication(client):
    response = client.get("/api/v1/exchange-rates")
    assert response.status_code == 401


def test_user_can_read_exchange_rates(user_client):
    response = user_client.get("/api/v1/exchange-rates")
    assert response.status_code == 200


def test_admin_can_create_exchange_rate(admin_client):
    response = admin_client.post(
        "/api/v1/exchange-rates",
        json={"currency_code": "eur", "rate_to_hkd": 8.5, "rate_to_usd": 1.09},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["currency_code"] == "EUR"
    assert body["rate_to_hkd"] == 8.5


def test_treasurer_role_alone_can_no_longer_create_exchange_rate(treasurer_client):
    # Story 12.7 retires the legacy require_treasurer_or_admin role check —
    # a "treasurer" role user has no special privilege now; only a matrix
    # grant (e.g. holding the Treasurer board position with Write on
    # admin.currencies) does.
    response = treasurer_client.post(
        "/api/v1/exchange-rates",
        json={"currency_code": "SGD", "rate_to_hkd": 5.8, "rate_to_usd": 0.74},
    )
    assert response.status_code == 403


def test_board_position_with_write_access_can_create_exchange_rate(
    build_client,
    make_user,
    make_member,
    make_board_position,
    make_board_position_assignment,
    make_app_function,
    make_permission_matrix_entry,
):
    from datetime import date

    from app.core.rotary_year import rotary_year

    member = make_member()
    user = make_user(email="treasurer-position@example.com", role="user", member_id=member.id)
    position = make_board_position(name="Treasurer")
    make_board_position_assignment(position.id, member.id, rotary_year=rotary_year(date.today()))
    app_function = make_app_function(key="admin.currencies", label="Admin — Currencies")
    make_permission_matrix_entry(app_function.id, board_position_id=position.id, access_level="write")

    response = build_client(user).post(
        "/api/v1/exchange-rates",
        json={"currency_code": "SGD", "rate_to_hkd": 5.8, "rate_to_usd": 0.74},
    )
    assert response.status_code == 201


def test_user_cannot_create_exchange_rate(user_client):
    response = user_client.post(
        "/api/v1/exchange-rates",
        json={"currency_code": "SGD", "rate_to_hkd": 5.8, "rate_to_usd": 0.74},
    )
    assert response.status_code == 403


def test_create_exchange_rate_rejects_unsupported_currency(admin_client):
    response = admin_client.post(
        "/api/v1/exchange-rates",
        json={"currency_code": "XXX", "rate_to_hkd": 1, "rate_to_usd": 1},
    )
    assert response.status_code == 422


def test_create_exchange_rate_duplicate_currency_returns_409(admin_client, make_exchange_rate):
    make_exchange_rate(currency_code="EUR")

    response = admin_client.post(
        "/api/v1/exchange-rates",
        json={"currency_code": "EUR", "rate_to_hkd": 8.5, "rate_to_usd": 1.09},
    )
    assert response.status_code == 409


def test_admin_can_update_exchange_rate(admin_client, make_exchange_rate):
    rate = make_exchange_rate(currency_code="EUR", rate_to_hkd=8.5, rate_to_usd=1.09)

    response = admin_client.patch(
        f"/api/v1/exchange-rates/{rate.id}", json={"rate_to_hkd": 8.6}
    )
    assert response.status_code == 200
    assert response.json()["rate_to_hkd"] == 8.6


def test_user_cannot_update_exchange_rate(user_client, make_exchange_rate):
    rate = make_exchange_rate(currency_code="EUR")

    response = user_client.patch(
        f"/api/v1/exchange-rates/{rate.id}", json={"rate_to_hkd": 9.0}
    )
    assert response.status_code == 403


def test_update_exchange_rate_not_found_returns_404(admin_client):
    response = admin_client.patch(
        "/api/v1/exchange-rates/00000000-0000-0000-0000-000000000000",
        json={"rate_to_hkd": 9.0},
    )
    assert response.status_code == 404


def test_admin_can_delete_exchange_rate(admin_client, make_exchange_rate):
    rate = make_exchange_rate(currency_code="EUR")

    response = admin_client.delete(f"/api/v1/exchange-rates/{rate.id}")
    assert response.status_code == 204

    list_response = admin_client.get("/api/v1/exchange-rates")
    codes = [r["currency_code"] for r in list_response.json()]
    assert "EUR" not in codes


def test_user_cannot_delete_exchange_rate(user_client, make_exchange_rate):
    rate = make_exchange_rate(currency_code="EUR")

    response = user_client.delete(f"/api/v1/exchange-rates/{rate.id}")
    assert response.status_code == 403
