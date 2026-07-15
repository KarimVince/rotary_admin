import pytest

from app.core.email_client import EmailSendError

pytestmark = pytest.mark.integration


def _always_succeeds(**_kwargs):
    return None


def _always_fails(**_kwargs):
    raise EmailSendError("simulated failure")


def _grant_invoices_manage_access(make_app_function, make_permission_matrix_entry):
    app_function = make_app_function(key="fees.run", label="Fees")
    make_permission_matrix_entry(
        app_function.id, board_position_id=None, access_level="write", is_default_user=True
    )


def test_send_requires_fee_settings_for_year(admin_client):
    response = admin_client.post("/api/v1/fee-runs/2099/send", json={})
    assert response.status_code == 400


def test_send_emails_only_unpaid_members(
    admin_client, make_fee_settings, make_member, make_member_fee, monkeypatch
):
    monkeypatch.setattr("app.api.fee_runs.send_email", _always_succeeds)
    make_fee_settings(rotary_year=2025)
    unpaid_member = make_member(first_name="Unpaid", email="unpaid@example.com")
    paid_member = make_member(first_name="Paid", email="paid@example.com")
    make_member_fee(member_id=unpaid_member.id, rotary_year=2025, is_paid=False)
    make_member_fee(member_id=paid_member.id, rotary_year=2025, is_paid=True)

    response = admin_client.post("/api/v1/fee-runs/2025/send", json={})
    assert response.status_code == 201
    body = response.json()
    assert body["sent_count"] == 1
    assert body["skipped_paid_count"] == 1
    assert body["failed_count"] == 0

    fees_by_member = {fee["member_id"]: fee for fee in body["member_fees"]}
    sent_fee = fees_by_member[str(unpaid_member.id)]
    assert sent_fee["invoice_send_count"] == 1
    assert sent_fee["invoice_sent_at"] is not None
    assert sent_fee["last_channel"] == "email"

    paid_fee = fees_by_member[str(paid_member.id)]
    assert paid_fee["invoice_send_count"] == 0
    assert paid_fee["invoice_sent_at"] is None


def test_resend_increments_send_count(
    admin_client, make_fee_settings, make_member, make_member_fee, monkeypatch
):
    monkeypatch.setattr("app.api.fee_runs.send_email", _always_succeeds)
    make_fee_settings(rotary_year=2025)
    member = make_member(email="member@example.com")
    make_member_fee(member_id=member.id, rotary_year=2025, is_paid=False)

    first = admin_client.post("/api/v1/fee-runs/2025/send", json={})
    second = admin_client.post("/api/v1/fee-runs/2025/send", json={})

    assert first.json()["member_fees"][0]["invoice_send_count"] == 1
    assert second.json()["member_fees"][0]["invoice_send_count"] == 2


def test_send_reports_failure_when_email_fails(
    admin_client, make_fee_settings, make_member, make_member_fee, monkeypatch
):
    monkeypatch.setattr("app.api.fee_runs.send_email", _always_fails)
    make_fee_settings(rotary_year=2025)
    member = make_member(email="member@example.com")
    make_member_fee(member_id=member.id, rotary_year=2025, is_paid=False)

    response = admin_client.post("/api/v1/fee-runs/2025/send", json={})
    assert response.status_code == 201
    body = response.json()
    assert body["sent_count"] == 0
    assert body["failed_count"] == 1
    assert body["member_fees"][0]["invoice_send_count"] == 0


def test_send_fails_for_member_without_email(
    admin_client, make_fee_settings, make_member, make_member_fee
):
    make_fee_settings(rotary_year=2025)
    member = make_member(email=None)
    make_member_fee(member_id=member.id, rotary_year=2025, is_paid=False)

    response = admin_client.post("/api/v1/fee-runs/2025/send", json={})
    assert response.status_code == 201
    body = response.json()
    assert body["failed_count"] == 1
    assert body["sent_count"] == 0


def test_send_with_explicit_member_ids(
    admin_client, make_fee_settings, make_member, make_member_fee, monkeypatch
):
    monkeypatch.setattr("app.api.fee_runs.send_email", _always_succeeds)
    make_fee_settings(rotary_year=2025)
    target_member = make_member(first_name="Target", email="target@example.com")
    other_member = make_member(first_name="Other", email="other@example.com")
    make_member_fee(member_id=target_member.id, rotary_year=2025, is_paid=False)
    make_member_fee(member_id=other_member.id, rotary_year=2025, is_paid=False)

    response = admin_client.post(
        "/api/v1/fee-runs/2025/send",
        json={"member_ids": [str(target_member.id)]},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["sent_count"] == 1
    assert body["member_fees"][0]["member_id"] == str(target_member.id)


def test_user_with_manage_access_can_send_invoices(
    treasurer_client,
    make_fee_settings,
    make_member,
    make_member_fee,
    make_app_function,
    make_permission_matrix_entry,
    monkeypatch,
):
    _grant_invoices_manage_access(make_app_function, make_permission_matrix_entry)
    monkeypatch.setattr("app.api.fee_runs.send_email", _always_succeeds)
    make_fee_settings(rotary_year=2025)
    member = make_member(email="member@example.com")
    make_member_fee(member_id=member.id, rotary_year=2025, is_paid=False)

    response = treasurer_client.post("/api/v1/fee-runs/2025/send", json={})
    assert response.status_code == 201


def test_non_admin_non_treasurer_cannot_send_invoices(user_client, make_fee_settings):
    make_fee_settings(rotary_year=2025)
    response = user_client.post("/api/v1/fee-runs/2025/send", json={})
    assert response.status_code == 403
