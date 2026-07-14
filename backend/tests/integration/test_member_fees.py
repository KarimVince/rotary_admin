import pytest

pytestmark = pytest.mark.integration


def _grant_invoices_manage_access(make_app_function, make_permission_matrix_entry):
    app_function = make_app_function(key="fees.tracking", label="Fees")
    make_permission_matrix_entry(
        app_function.id, board_position_id=None, access_level="write", is_default_user=True
    )


def test_mark_fee_paid_sets_paid_date(admin_client, make_member, make_member_fee):
    member = make_member()
    fee = make_member_fee(member_id=member.id, rotary_year=2025, is_paid=False)

    response = admin_client.patch(f"/api/v1/member-fees/{fee.id}", json={"is_paid": True})
    assert response.status_code == 200
    body = response.json()
    assert body["is_paid"] is True
    assert body["paid_date"] is not None


def test_mark_fee_paid_records_who_changed_it(admin_client, make_member, make_member_fee):
    member = make_member()
    fee = make_member_fee(member_id=member.id, rotary_year=2025, is_paid=False)
    assert fee.paid_by is None

    response = admin_client.patch(f"/api/v1/member-fees/{fee.id}", json={"is_paid": True})
    assert response.status_code == 200
    assert response.json()["paid_by"] is not None


def test_updating_notes_only_does_not_set_paid_by(admin_client, make_member, make_member_fee):
    member = make_member()
    fee = make_member_fee(member_id=member.id, rotary_year=2025, is_paid=False)

    response = admin_client.patch(f"/api/v1/member-fees/{fee.id}", json={"notes": "Called member"})
    assert response.status_code == 200
    assert response.json()["paid_by"] is None


def test_mark_fee_paid_with_explicit_paid_date(admin_client, make_member, make_member_fee):
    member = make_member()
    fee = make_member_fee(member_id=member.id, rotary_year=2025, is_paid=False)

    response = admin_client.patch(
        f"/api/v1/member-fees/{fee.id}",
        json={"is_paid": True, "paid_date": "2025-08-15"},
    )
    assert response.status_code == 200
    assert response.json()["paid_date"] == "2025-08-15"


def test_mark_fee_unpaid_clears_paid_date(admin_client, make_member, make_member_fee):
    member = make_member()
    fee = make_member_fee(member_id=member.id, rotary_year=2025, is_paid=True)

    response = admin_client.patch(f"/api/v1/member-fees/{fee.id}", json={"is_paid": False})
    assert response.status_code == 200
    body = response.json()
    assert body["is_paid"] is False
    assert body["paid_date"] is None


def test_amend_amount_paid_preserves_original_amount_due(
    admin_client, make_member, make_member_fee
):
    member = make_member()
    fee = make_member_fee(member_id=member.id, rotary_year=2025, amount_due=500, is_paid=False)

    response = admin_client.patch(
        f"/api/v1/member-fees/{fee.id}",
        json={"is_paid": True, "amount_paid": 350},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["amount_due"] == 500
    assert body["amount_paid"] == 350
    assert body["paid_by"] is not None


def test_amend_amount_paid_accepts_zero(admin_client, make_member, make_member_fee):
    # Story 8.29: 0 is now a legitimate amount — fee-exempt members are
    # still tracked, at a zero amount, rather than left unrecorded.
    member = make_member()
    fee = make_member_fee(member_id=member.id, rotary_year=2025)

    response = admin_client.patch(
        f"/api/v1/member-fees/{fee.id}", json={"amount_paid": 0}
    )
    assert response.status_code == 200
    assert response.json()["amount_paid"] == 0


def test_amend_amount_paid_rejects_negative_value(admin_client, make_member, make_member_fee):
    member = make_member()
    fee = make_member_fee(member_id=member.id, rotary_year=2025)

    response = admin_client.patch(
        f"/api/v1/member-fees/{fee.id}", json={"amount_paid": -50}
    )
    assert response.status_code == 422


def test_mark_fee_unpaid_clears_amount_paid(admin_client, make_member, make_member_fee):
    member = make_member()
    fee = make_member_fee(member_id=member.id, rotary_year=2025, is_paid=True)
    admin_client.patch(f"/api/v1/member-fees/{fee.id}", json={"amount_paid": 400})

    response = admin_client.patch(f"/api/v1/member-fees/{fee.id}", json={"is_paid": False})
    assert response.status_code == 200
    assert response.json()["amount_paid"] is None


def test_update_fee_notes(admin_client, make_member, make_member_fee):
    member = make_member()
    fee = make_member_fee(member_id=member.id, rotary_year=2025)

    response = admin_client.patch(
        f"/api/v1/member-fees/{fee.id}", json={"notes": "Paid by cheque"}
    )
    assert response.status_code == 200
    assert response.json()["notes"] == "Paid by cheque"


def test_set_invoice_sent_stamps_invoice_sent_at(admin_client, make_member, make_member_fee):
    member = make_member()
    fee = make_member_fee(member_id=member.id, rotary_year=2025)
    assert fee.invoice_sent_at is None

    response = admin_client.patch(
        f"/api/v1/member-fees/{fee.id}", json={"invoice_sent": True, "last_channel": "manual"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["invoice_sent_at"] is not None
    assert body["last_channel"] == "manual"
    # invoice_send_count is the automated send flow's own audit trail —
    # a manual "Invoice Sent" checkbox must not bump it.
    assert body["invoice_send_count"] == 0


def test_unset_invoice_sent_clears_invoice_sent_at(admin_client, make_member, make_member_fee):
    member = make_member()
    fee = make_member_fee(member_id=member.id, rotary_year=2025)
    admin_client.patch(f"/api/v1/member-fees/{fee.id}", json={"invoice_sent": True})

    response = admin_client.patch(f"/api/v1/member-fees/{fee.id}", json={"invoice_sent": False})
    assert response.status_code == 200
    assert response.json()["invoice_sent_at"] is None


def test_last_channel_rejects_unknown_value(admin_client, make_member, make_member_fee):
    member = make_member()
    fee = make_member_fee(member_id=member.id, rotary_year=2025)

    response = admin_client.patch(
        f"/api/v1/member-fees/{fee.id}", json={"last_channel": "carrier_pigeon"}
    )
    assert response.status_code == 422


def test_update_fee_not_found_returns_404(admin_client):
    response = admin_client.patch(
        "/api/v1/member-fees/00000000-0000-0000-0000-000000000000", json={"is_paid": True}
    )
    assert response.status_code == 404


def test_user_with_manage_access_can_mark_fee_paid(
    treasurer_client, make_member, make_member_fee, make_app_function, make_permission_matrix_entry
):
    _grant_invoices_manage_access(make_app_function, make_permission_matrix_entry)
    member = make_member()
    fee = make_member_fee(member_id=member.id, rotary_year=2025)

    response = treasurer_client.patch(f"/api/v1/member-fees/{fee.id}", json={"is_paid": True})
    assert response.status_code == 200


def test_non_admin_non_treasurer_cannot_update_fee(user_client, make_member, make_member_fee):
    member = make_member()
    fee = make_member_fee(member_id=member.id, rotary_year=2025)

    response = user_client.patch(f"/api/v1/member-fees/{fee.id}", json={"is_paid": True})
    assert response.status_code == 403


def test_list_member_fees_filters_by_year_and_paid_status(
    admin_client, make_member, make_member_fee
):
    member_a = make_member(first_name="A")
    member_b = make_member(first_name="B")
    make_member_fee(member_id=member_a.id, rotary_year=2025, is_paid=False)
    make_member_fee(member_id=member_b.id, rotary_year=2025, is_paid=True)
    make_member_fee(member_id=member_a.id, rotary_year=2024, is_paid=False)

    response = admin_client.get(
        "/api/v1/member-fees", params={"rotary_year": 2025, "is_paid": False}
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["member_id"] == str(member_a.id)
    assert body[0]["rotary_year"] == 2025


def test_list_member_fees_requires_treasurer_or_admin(user_client):
    response = user_client.get("/api/v1/member-fees")
    assert response.status_code == 403


def test_statistics_returns_accurate_totals(
    admin_client, make_fee_settings, make_member, make_member_fee
):
    make_fee_settings(rotary_year=2025, currency="HKD")
    m1 = make_member(first_name="Paid1")
    m2 = make_member(first_name="Paid2")
    m3 = make_member(first_name="Unpaid1")
    make_member_fee(member_id=m1.id, rotary_year=2025, price_type="early_bird", amount_due=500, is_paid=True)
    make_member_fee(member_id=m2.id, rotary_year=2025, price_type="full", amount_due=600, is_paid=True)
    make_member_fee(member_id=m3.id, rotary_year=2025, price_type="early_bird", amount_due=500, is_paid=False)

    response = admin_client.get("/api/v1/member-fees/statistics", params={"rotary_year": 2025})
    assert response.status_code == 200
    body = response.json()
    assert body["rotary_year"] == 2025
    assert body["currency"] == "HKD"
    assert body["total_members"] == 3
    assert body["paid_count"] == 2
    assert body["unpaid_count"] == 1
    assert body["total_collected"] == 1100
    assert body["total_outstanding"] == 500
    assert round(body["collection_rate"], 2) == round(1100 / 1600 * 100, 2)

    breakdown_by_type = {item["price_type"]: item for item in body["breakdown_by_price_type"]}
    assert breakdown_by_type["early_bird"]["count"] == 2
    assert breakdown_by_type["early_bird"]["total_amount"] == 1000
    assert breakdown_by_type["full"]["count"] == 1
    assert breakdown_by_type["full"]["total_amount"] == 600

    # Story 8.31: active non-honorary member count is a Member-table count
    # (all 3 members are active-during-2025, non-honorary), independent of
    # how many of them actually have a MemberFee row.
    assert body["active_member_count"] == 3
    assert round(body["average_fee_per_active_member"], 2) == round(1100 / 3, 2)


def test_statistics_excludes_honorary_from_active_member_count(
    admin_client, make_fee_settings, make_member
):
    make_fee_settings(rotary_year=2025)
    make_member(first_name="Honorary", is_honorary=True)
    make_member(first_name="Regular")

    response = admin_client.get("/api/v1/member-fees/statistics", params={"rotary_year": 2025})
    assert response.status_code == 200
    assert response.json()["active_member_count"] == 1


def test_statistics_uses_amended_amount_paid_when_set(
    admin_client, make_fee_settings, make_member, make_member_fee
):
    make_fee_settings(rotary_year=2025, currency="HKD")
    full_payer = make_member(first_name="Full")
    prorated_payer = make_member(first_name="Prorated")
    make_member_fee(
        member_id=full_payer.id, rotary_year=2025, amount_due=500, is_paid=True
    )
    prorated_fee = make_member_fee(
        member_id=prorated_payer.id, rotary_year=2025, amount_due=500, is_paid=True
    )
    admin_client.patch(f"/api/v1/member-fees/{prorated_fee.id}", json={"amount_paid": 250})

    response = admin_client.get("/api/v1/member-fees/statistics", params={"rotary_year": 2025})
    assert response.status_code == 200
    # 500 (unamended) + 250 (amended) = 750, not 1000 — amount_due is not
    # double-counted once amount_paid has been set for a record.
    assert response.json()["total_collected"] == 750


def test_statistics_with_no_fees_returns_zeroes(admin_client):
    response = admin_client.get("/api/v1/member-fees/statistics", params={"rotary_year": 2099})
    assert response.status_code == 200
    body = response.json()
    assert body["total_members"] == 0
    assert body["collection_rate"] == 0.0
    assert body["currency"] is None


def test_statistics_requires_treasurer_or_admin(user_client):
    response = user_client.get("/api/v1/member-fees/statistics")
    assert response.status_code == 403


def test_statistics_history_covers_all_years_with_data(
    admin_client, make_fee_settings, make_member, make_member_fee
):
    from datetime import date

    from app.core.rotary_year import rotary_year as compute_rotary_year

    current_year = compute_rotary_year(date.today())
    earliest_year = current_year - 2

    payer = make_member(first_name="Payer", join_date=date(2015, 1, 1))
    zero_member = make_member(first_name="Zero", join_date=date(2015, 1, 1))
    make_fee_settings(rotary_year=earliest_year)
    make_member_fee(
        member_id=payer.id, rotary_year=earliest_year, amount_due=500, is_paid=True
    )
    fee = make_member_fee(
        member_id=zero_member.id, rotary_year=earliest_year, amount_due=500, is_paid=False
    )
    admin_client.patch(f"/api/v1/member-fees/{fee.id}", json={"amount_paid": 0})
    # Nudge the payer's amount_paid via the endpoint too, exercising the
    # actual PATCH path used by the sub-screen.
    payer_fee_id = admin_client.get(
        "/api/v1/member-fees", params={"rotary_year": earliest_year}
    ).json()
    payer_fee = next(f for f in payer_fee_id if f["member_id"] == str(payer.id))
    admin_client.patch(f"/api/v1/member-fees/{payer_fee['id']}", json={"amount_paid": 500})

    response = admin_client.get("/api/v1/member-fees/statistics/history")
    assert response.status_code == 200
    body = response.json()
    years = [row["rotary_year"] for row in body]

    # No gap in the X-axis: every year from the earliest with data through
    # the current one is present, even years with no fee records at all.
    assert years == list(range(earliest_year, current_year + 1))

    earliest_row = next(row for row in body if row["rotary_year"] == earliest_year)
    assert earliest_row["total_collected"] == 500
    assert earliest_row["paid_count"] == 1
    assert earliest_row["zero_count"] == 1

    later_year_row = next(row for row in body if row["rotary_year"] == earliest_year + 1)
    assert later_year_row["total_collected"] == 0
    assert later_year_row["paid_count"] == 0
    # Both members are still active-during that year even with no fee run.
    assert later_year_row["zero_count"] == 2


def test_statistics_history_excludes_honorary_members(
    admin_client, make_fee_settings, make_member, make_member_fee
):
    from datetime import date

    from app.core.rotary_year import rotary_year as compute_rotary_year

    current_year = compute_rotary_year(date.today())
    make_fee_settings(rotary_year=current_year)
    make_member(first_name="Honorary", is_honorary=True, join_date=date(2015, 1, 1))

    response = admin_client.get("/api/v1/member-fees/statistics/history")
    assert response.status_code == 200
    current_row = next(row for row in response.json() if row["rotary_year"] == current_year)
    assert current_row["zero_count"] == 0


def test_statistics_history_requires_treasurer_or_admin(user_client):
    response = user_client.get("/api/v1/member-fees/statistics/history")
    assert response.status_code == 403
