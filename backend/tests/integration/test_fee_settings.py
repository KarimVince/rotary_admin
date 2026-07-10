import pytest

pytestmark = pytest.mark.integration


def _grant_invoices_manage_access(make_app_function, make_permission_matrix_entry):
    app_function = make_app_function(key="fees.settings", label="Fees")
    make_permission_matrix_entry(
        app_function.id, board_position_id=None, access_level="write", is_default_user=True
    )


def test_create_then_get_fee_settings_round_trip(admin_client):
    create_response = admin_client.post(
        "/api/v1/fee-settings",
        json={
            "rotary_year": 2025,
            "early_bird_single_price": 500,
            "early_bird_couple_price": 900,
            "full_single_price": 600,
            "full_couple_price": 1000,
        },
    )
    assert create_response.status_code == 201
    created = create_response.json()
    assert created["rotary_year"] == 2025
    assert created["currency"] == "HKD"

    get_response = admin_client.get("/api/v1/fee-settings/2025")
    assert get_response.status_code == 200
    assert get_response.json()["full_couple_price"] == 1000


def test_user_with_manage_access_can_create_fee_settings(
    treasurer_client, make_app_function, make_permission_matrix_entry
):
    _grant_invoices_manage_access(make_app_function, make_permission_matrix_entry)
    response = treasurer_client.post(
        "/api/v1/fee-settings",
        json={
            "rotary_year": 2026,
            "early_bird_single_price": 500,
            "early_bird_couple_price": 900,
            "full_single_price": 600,
            "full_couple_price": 1000,
        },
    )
    assert response.status_code == 201


def test_non_admin_non_treasurer_cannot_create_fee_settings(user_client):
    response = user_client.post(
        "/api/v1/fee-settings",
        json={
            "rotary_year": 2025,
            "early_bird_single_price": 500,
            "early_bird_couple_price": 900,
            "full_single_price": 600,
            "full_couple_price": 1000,
        },
    )
    assert response.status_code == 403


def test_non_admin_non_treasurer_cannot_list_fee_settings(user_client):
    response = user_client.get("/api/v1/fee-settings")
    assert response.status_code == 403


def test_list_fee_settings_requires_authentication(client):
    response = client.get("/api/v1/fee-settings")
    assert response.status_code == 401


def test_create_fee_settings_rejects_duplicate_rotary_year(admin_client, make_fee_settings):
    make_fee_settings(rotary_year=2025)
    response = admin_client.post(
        "/api/v1/fee-settings",
        json={
            "rotary_year": 2025,
            "early_bird_single_price": 500,
            "early_bird_couple_price": 900,
            "full_single_price": 600,
            "full_couple_price": 1000,
        },
    )
    assert response.status_code == 409


@pytest.mark.parametrize(
    "field", ["early_bird_single_price", "early_bird_couple_price", "full_single_price", "full_couple_price"]
)
def test_create_fee_settings_rejects_non_positive_prices(admin_client, field):
    payload = {
        "rotary_year": 2025,
        "early_bird_single_price": 500,
        "early_bird_couple_price": 900,
        "full_single_price": 600,
        "full_couple_price": 1000,
    }
    payload[field] = 0
    response = admin_client.post("/api/v1/fee-settings", json=payload)
    assert response.status_code == 422


def test_create_fee_settings_rejects_unsupported_currency(admin_client):
    response = admin_client.post(
        "/api/v1/fee-settings",
        json={
            "rotary_year": 2025,
            "early_bird_single_price": 500,
            "early_bird_couple_price": 900,
            "full_single_price": 600,
            "full_couple_price": 1000,
            "currency": "XXX",
        },
    )
    assert response.status_code == 422


def test_get_fee_settings_not_found_returns_404(admin_client):
    response = admin_client.get("/api/v1/fee-settings/1999")
    assert response.status_code == 404


def test_list_fee_settings_orders_by_year_desc(admin_client, make_fee_settings):
    make_fee_settings(rotary_year=2023)
    make_fee_settings(rotary_year=2025)
    make_fee_settings(rotary_year=2024)

    response = admin_client.get("/api/v1/fee-settings")
    assert response.status_code == 200
    years = [row["rotary_year"] for row in response.json()]
    assert years == [2025, 2024, 2023]


def test_admin_can_update_fee_settings(admin_client, make_fee_settings):
    make_fee_settings(rotary_year=2025, full_couple_price=1000)
    response = admin_client.patch(
        "/api/v1/fee-settings/2025", json={"full_couple_price": 1200}
    )
    assert response.status_code == 200
    assert response.json()["full_couple_price"] == 1200


def test_update_fee_settings_not_found_returns_404(admin_client):
    response = admin_client.patch("/api/v1/fee-settings/1999", json={"full_couple_price": 1200})
    assert response.status_code == 404


def test_non_admin_non_treasurer_cannot_update_fee_settings(user_client, make_fee_settings):
    make_fee_settings(rotary_year=2025)
    response = user_client.patch(
        "/api/v1/fee-settings/2025", json={"full_couple_price": 1200}
    )
    assert response.status_code == 403
