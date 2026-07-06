import pytest

pytestmark = pytest.mark.integration


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


def test_treasurer_can_create_exchange_rate(treasurer_client):
    response = treasurer_client.post(
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
