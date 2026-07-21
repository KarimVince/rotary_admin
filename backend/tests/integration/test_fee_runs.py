from datetime import date

import pytest

pytestmark = pytest.mark.integration


def _grant_invoices_manage_access(make_app_function, make_permission_matrix_entry):
    app_function = make_app_function(key="fees.run", label="Fees")
    make_permission_matrix_entry(
        app_function.id, board_position_id=None, access_level="write", is_default_user=True
    )


def test_fee_run_requires_fee_settings_for_year(admin_client, make_member):
    make_member(status="active")
    response = admin_client.post(
        "/api/v1/fee-runs",
        json={"rotary_year": 2099, "price_type": "early_bird", "target": "all_members"},
    )
    assert response.status_code == 400


def test_fee_run_creates_records_using_correct_price_tier(
    admin_client, make_fee_settings, make_member
):
    make_fee_settings(
        rotary_year=2025,
        early_bird_single_price=500,
        early_bird_couple_price=900,
        full_single_price=600,
        full_couple_price=1000,
    )
    single_member = make_member(first_name="Single", is_couple=False)
    couple_member = make_member(first_name="Couple", is_couple=True)

    response = admin_client.post(
        "/api/v1/fee-runs",
        json={"rotary_year": 2025, "price_type": "early_bird", "target": "all_members"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["created_count"] == 2
    assert body["updated_count"] == 0
    assert body["skipped_paid_count"] == 0

    fees_by_member = {fee["member_id"]: fee for fee in body["member_fees"]}
    assert fees_by_member[str(single_member.id)]["amount_due"] == 500
    assert fees_by_member[str(single_member.id)]["is_couple_at_billing"] is False
    assert fees_by_member[str(couple_member.id)]["amount_due"] == 900
    assert fees_by_member[str(couple_member.id)]["is_couple_at_billing"] is True


def test_fee_run_skips_already_paid_members(
    admin_client, make_fee_settings, make_member, make_member_fee
):
    make_fee_settings(rotary_year=2025)
    paid_member = make_member(first_name="Paid")
    make_member_fee(
        member_id=paid_member.id,
        rotary_year=2025,
        price_type="early_bird",
        amount_due=500,
        is_paid=True,
    )

    response = admin_client.post(
        "/api/v1/fee-runs",
        json={"rotary_year": 2025, "price_type": "full", "target": "all_members"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["skipped_paid_count"] == 1
    assert body["created_count"] == 0
    assert body["updated_count"] == 0
    fee = body["member_fees"][0]
    assert fee["price_type"] == "early_bird"
    assert fee["amount_due"] == 500


def test_fee_run_updates_unpaid_member_with_new_price_tier(
    admin_client, make_fee_settings, make_member, make_member_fee
):
    make_fee_settings(
        rotary_year=2025, early_bird_single_price=500, full_single_price=600
    )
    member = make_member(is_couple=False)
    make_member_fee(
        member_id=member.id,
        rotary_year=2025,
        price_type="early_bird",
        amount_due=500,
        is_paid=False,
    )

    response = admin_client.post(
        "/api/v1/fee-runs",
        json={"rotary_year": 2025, "price_type": "full", "target": "all_unpaid"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["updated_count"] == 1
    assert body["created_count"] == 0
    fee = body["member_fees"][0]
    assert fee["price_type"] == "full"
    assert fee["amount_due"] == 600


def test_fee_run_excludes_non_active_members(admin_client, make_fee_settings, make_member):
    # Story 8.29: scoping is by membership dates for the selected rotary
    # year, not today's Member.status — so a "past" member must actually
    # have left before the year started to be excluded.
    make_fee_settings(rotary_year=2025)
    make_member(first_name="Past", status="past", leave_date=date(2024, 6, 1))
    active_member = make_member(first_name="Active", status="active")

    response = admin_client.post(
        "/api/v1/fee-runs",
        json={"rotary_year": 2025, "price_type": "early_bird", "target": "all_members"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["created_count"] == 1
    assert body["member_fees"][0]["member_id"] == str(active_member.id)


def test_fee_run_excludes_honorary_members(admin_client, make_fee_settings, make_member):
    make_fee_settings(rotary_year=2025)
    make_member(first_name="Honorary", is_honorary=True)
    active_member = make_member(first_name="Active")

    response = admin_client.post(
        "/api/v1/fee-runs",
        json={"rotary_year": 2025, "price_type": "early_bird", "target": "all_members"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["created_count"] == 1
    assert body["member_fees"][0]["member_id"] == str(active_member.id)


def test_fee_run_includes_member_active_only_during_past_year(
    admin_client, make_fee_settings, make_member
):
    # Dan Howell scenario from the story: a member who has since left must
    # still appear in a fee run for a past rotary year they were active in.
    make_fee_settings(rotary_year=2025)
    past_member = make_member(
        first_name="Dan",
        last_name="Howell",
        status="past",
        join_date=date(2015, 1, 1),
        leave_date=date(2026, 1, 1),
    )

    response = admin_client.post(
        "/api/v1/fee-runs",
        json={"rotary_year": 2025, "price_type": "early_bird", "target": "all_members"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["created_count"] == 1
    assert body["member_fees"][0]["member_id"] == str(past_member.id)


def test_fee_run_excludes_member_who_joined_after_selected_year(
    admin_client, make_fee_settings, make_member
):
    make_fee_settings(rotary_year=2025)
    # rotary_year(2025-08-01) == 2025 (month >= 7), so that date is actually
    # *within* rotary year 2025, not after it — use a date in the following
    # rotary year (2026) to genuinely test "joined after the selected year".
    make_member(first_name="Future", join_date=date(2026, 8, 1))

    response = admin_client.post(
        "/api/v1/fee-runs",
        json={"rotary_year": 2025, "price_type": "early_bird", "target": "all_members"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["created_count"] == 0


def test_fee_run_with_explicit_member_ids(admin_client, make_fee_settings, make_member):
    make_fee_settings(rotary_year=2025)
    target_member = make_member(first_name="Target")
    make_member(first_name="Other")

    response = admin_client.post(
        "/api/v1/fee-runs",
        json={
            "rotary_year": 2025,
            "price_type": "early_bird",
            "target": "member_ids",
            "member_ids": [str(target_member.id)],
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["created_count"] == 1
    assert body["member_fees"][0]["member_id"] == str(target_member.id)


def test_fee_run_with_member_tiers_applies_each_members_own_tier(
    admin_client, make_fee_settings, make_member
):
    make_fee_settings(
        rotary_year=2025,
        early_bird_single_price=500,
        early_bird_couple_price=900,
        full_single_price=600,
        full_couple_price=1000,
    )
    early_bird_member = make_member(first_name="Early", is_couple=False)
    full_member = make_member(first_name="Full", is_couple=True)

    response = admin_client.post(
        "/api/v1/fee-runs",
        json={
            "rotary_year": 2025,
            "member_tiers": [
                {"member_id": str(early_bird_member.id), "price_type": "early_bird"},
                {"member_id": str(full_member.id), "price_type": "full"},
            ],
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["price_type"] is None
    assert body["created_count"] == 2

    fees_by_member = {fee["member_id"]: fee for fee in body["member_fees"]}
    early_fee = fees_by_member[str(early_bird_member.id)]
    assert early_fee["price_type"] == "early_bird"
    assert early_fee["amount_due"] == 500

    full_fee = fees_by_member[str(full_member.id)]
    assert full_fee["price_type"] == "full"
    assert full_fee["amount_due"] == 1000


def test_fee_run_member_tiers_excludes_members_not_listed(
    admin_client, make_fee_settings, make_member
):
    make_fee_settings(rotary_year=2025)
    included = make_member(first_name="Included")
    make_member(first_name="Excluded")

    response = admin_client.post(
        "/api/v1/fee-runs",
        json={
            "rotary_year": 2025,
            "member_tiers": [{"member_id": str(included.id), "price_type": "early_bird"}],
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["created_count"] == 1
    assert body["member_fees"][0]["member_id"] == str(included.id)


def test_fee_run_rejects_both_member_tiers_and_price_type(admin_client, make_fee_settings):
    make_fee_settings(rotary_year=2025)
    response = admin_client.post(
        "/api/v1/fee-runs",
        json={
            "rotary_year": 2025,
            "price_type": "early_bird",
            "target": "all_members",
            "member_tiers": [{"member_id": "00000000-0000-0000-0000-000000000000", "price_type": "full"}],
        },
    )
    assert response.status_code == 422


def test_fee_run_member_ids_target_requires_member_ids(admin_client, make_fee_settings):
    make_fee_settings(rotary_year=2025)
    response = admin_client.post(
        "/api/v1/fee-runs",
        json={"rotary_year": 2025, "price_type": "early_bird", "target": "member_ids"},
    )
    assert response.status_code == 422


def test_user_with_manage_access_can_trigger_fee_run(
    treasurer_client, make_fee_settings, make_member, make_app_function, make_permission_matrix_entry
):
    _grant_invoices_manage_access(make_app_function, make_permission_matrix_entry)
    make_fee_settings(rotary_year=2025)
    make_member()
    response = treasurer_client.post(
        "/api/v1/fee-runs",
        json={"rotary_year": 2025, "price_type": "early_bird", "target": "all_members"},
    )
    assert response.status_code == 201


def test_non_admin_non_treasurer_cannot_trigger_fee_run(user_client, make_fee_settings):
    make_fee_settings(rotary_year=2025)
    response = user_client.post(
        "/api/v1/fee-runs",
        json={"rotary_year": 2025, "price_type": "early_bird", "target": "all_members"},
    )
    assert response.status_code == 403


def test_list_member_fees_for_year(admin_client, make_member, make_member_fee):
    member = make_member()
    make_member_fee(member_id=member.id, rotary_year=2025, amount_due=500)

    response = admin_client.get("/api/v1/fee-runs/2025")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["member_id"] == str(member.id)


def test_list_member_fees_for_year_requires_treasurer_or_admin(user_client):
    response = user_client.get("/api/v1/fee-runs/2025")
    assert response.status_code == 403


def test_view_only_access_does_not_grant_fee_run_creation(
    build_client, make_user, make_fee_settings, make_app_function, make_permission_matrix_entry
):
    # Story 12.5: fee_runs.py now hangs entirely off the single fees.run key
    # (re-pointed from the old invoices.view/invoices.manage split) — Read on
    # it still must not grant Write actions like creating a fee run.
    app_function = make_app_function(key="fees.run", label="Fees")
    make_permission_matrix_entry(
        app_function.id, board_position_id=None, access_level="read", is_default_user=True
    )
    user = make_user(email="view-only@example.com", role="user")
    make_fee_settings(rotary_year=2025)

    response = build_client(user).post(
        "/api/v1/fee-runs",
        json={"rotary_year": 2025, "price_type": "early_bird", "target": "all_members"},
    )
    assert response.status_code == 403


def test_view_access_allows_listing_fee_runs(
    build_client, make_user, make_member, make_member_fee, make_app_function, make_permission_matrix_entry
):
    app_function = make_app_function(key="fees.run", label="Fees")
    make_permission_matrix_entry(
        app_function.id, board_position_id=None, access_level="read", is_default_user=True
    )
    user = make_user(email="viewer@example.com", role="user")
    member = make_member()
    make_member_fee(member_id=member.id, rotary_year=2025, amount_due=500)

    response = build_client(user).get("/api/v1/fee-runs/2025")
    assert response.status_code == 200
