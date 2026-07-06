import pytest

pytestmark = pytest.mark.integration


def _upload_csv(client, csv_text: str):
    return client.post(
        "/api/v1/rotary-friends/import/preview",
        files={"file": ("friends.csv", csv_text.encode("utf-8"), "text/csv")},
    )


def test_non_admin_cannot_preview_import(user_client):
    response = _upload_csv(user_client, "name,email\nJane Doe,jane@example.com\n")
    assert response.status_code == 403


def test_preview_parses_valid_rows(admin_client):
    csv_text = (
        "name,email,whatsapp,tags,source,notes\n"
        "Jane Doe,jane@example.com,,donor,Gala 2024,Met at auction\n"
    )
    response = _upload_csv(admin_client, csv_text)

    assert response.status_code == 200
    body = response.json()
    assert body["valid_count"] == 1
    assert body["error_count"] == 0
    assert body["duplicate_count"] == 0
    row = body["rows"][0]
    assert row["first_name"] == "Jane"
    assert row["last_name"] == "Doe"
    assert row["email"] == "jane@example.com"
    assert row["errors"] == []


def test_preview_flags_row_with_no_contact_method(admin_client):
    csv_text = "name,email,whatsapp\nNo Contact,,\n"
    response = _upload_csv(admin_client, csv_text)

    assert response.status_code == 200
    body = response.json()
    assert body["error_count"] == 1
    assert len(body["rows"][0]["errors"]) > 0


def test_preview_flags_duplicate_within_file(admin_client):
    csv_text = (
        "name,email\n"
        "Jane Doe,jane@example.com\n"
        "Jane Duplicate,jane@example.com\n"
    )
    response = _upload_csv(admin_client, csv_text)

    assert response.status_code == 200
    body = response.json()
    assert body["duplicate_count"] == 1
    assert body["rows"][0]["is_duplicate"] is False
    assert body["rows"][1]["is_duplicate"] is True


def test_preview_flags_duplicate_against_existing_friend(admin_client, make_rotary_friend):
    make_rotary_friend(email="existing@example.com")

    csv_text = "name,email\nNew Person,existing@example.com\n"
    response = _upload_csv(admin_client, csv_text)

    assert response.status_code == 200
    body = response.json()
    assert body["duplicate_count"] == 1
    assert body["rows"][0]["is_duplicate"] is True


def test_preview_rejects_empty_csv(admin_client):
    response = _upload_csv(admin_client, "")
    assert response.status_code == 422


def test_non_admin_cannot_commit_import(user_client):
    response = user_client.post(
        "/api/v1/rotary-friends/import",
        json={"friends": [{"first_name": "Jane", "last_name": "Doe", "email": "j@example.com"}]},
    )
    assert response.status_code == 403


def test_commit_creates_friends(admin_client):
    response = admin_client.post(
        "/api/v1/rotary-friends/import",
        json={
            "friends": [
                {"first_name": "Jane", "last_name": "Doe", "email": "jane@example.com"},
                {"first_name": "Whats", "last_name": "App", "whatsapp": "+85298765432"},
            ]
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["created_count"] == 2
    assert body["skipped_count"] == 0

    list_response = admin_client.get("/api/v1/rotary-friends")
    names = [f["first_name"] for f in list_response.json()]
    assert "Jane" in names
    assert "Whats" in names


def test_commit_skips_duplicate_against_existing_friend(admin_client, make_rotary_friend):
    make_rotary_friend(email="existing@example.com")

    response = admin_client.post(
        "/api/v1/rotary-friends/import",
        json={
            "friends": [
                {"first_name": "New", "last_name": "Person", "email": "existing@example.com"},
            ]
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["created_count"] == 0
    assert body["skipped_count"] == 1
    assert body["skipped_emails"] == ["existing@example.com"]


def test_commit_skips_duplicate_within_batch(admin_client):
    response = admin_client.post(
        "/api/v1/rotary-friends/import",
        json={
            "friends": [
                {"first_name": "Jane", "last_name": "Doe", "email": "jane@example.com"},
                {"first_name": "Jane", "last_name": "Duplicate", "email": "jane@example.com"},
            ]
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["created_count"] == 1
    assert body["skipped_count"] == 1


def test_non_admin_cannot_export(user_client):
    response = user_client.get("/api/v1/rotary-friends/export")
    assert response.status_code == 403


def test_export_returns_csv_of_friends(admin_client, make_rotary_friend):
    make_rotary_friend(first_name="Jane", last_name="Doe", email="jane@example.com")

    response = admin_client.get("/api/v1/rotary-friends/export")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "jane@example.com" in response.text
    assert "Jane" in response.text
