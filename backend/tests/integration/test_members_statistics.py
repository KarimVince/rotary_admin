from datetime import date

import pytest

from app.core.rotary_year import rotary_year

pytestmark = pytest.mark.integration


def _age_bucket(age: int) -> str:
    if age < 30:
        return "<30"
    if age < 40:
        return "30-39"
    if age < 50:
        return "40-49"
    if age < 60:
        return "50-59"
    if age < 70:
        return "60-69"
    return "70+"


def _years_ago(years: int) -> str:
    today = date.today()
    return date(today.year - years, today.month, today.day).isoformat()


def test_statistics_requires_authentication(client):
    response = client.get("/api/v1/members/statistics")

    assert response.status_code == 401


def test_statistics_empty_dataset(user_client):
    response = user_client.get("/api/v1/members/statistics")

    assert response.status_code == 200
    body = response.json()
    assert body["by_status"] == []
    assert body["by_join_year"] == []
    assert body["average_tenure_years"] is None
    assert body["growth_by_rotary_year"] == []
    assert body["by_nationality"] == []
    assert body["by_classification"] == []
    assert body["average_age"] is None
    assert len(body["age_distribution"]) == 6
    assert all(bucket["value"] == 0 for bucket in body["age_distribution"])


def test_statistics_reflects_seeded_data(admin_client, user_client):
    today = date.today()

    dob_young = _years_ago(25)
    dob_mid = _years_ago(45)
    dob_old = _years_ago(72)

    age_young = (today - date.fromisoformat(dob_young)).days // 365
    age_mid = (today - date.fromisoformat(dob_mid)).days // 365
    age_old = (today - date.fromisoformat(dob_old)).days // 365

    admin_client.post(
        "/api/v1/members",
        json={
            "first_name": "Alice",
            "last_name": "A",
            "email": "alice@example.com",
            "join_date": "2020-03-01",
            "nationality": "France",
            "classification": "Accounting",
            "date_of_birth": dob_young,
        },
    )
    admin_client.post(
        "/api/v1/members",
        json={
            "first_name": "Bob",
            "last_name": "B",
            "email": "bob@example.com",
            "join_date": "2021-08-15",
            "leave_date": "2023-08-20",
            "status": "past",
            "nationality": "UK",
            "classification": "Law",
            "date_of_birth": dob_mid,
        },
    )
    admin_client.post(
        "/api/v1/members",
        json={
            "first_name": "Carol",
            "last_name": "C",
            "email": "carol@example.com",
            "join_date": "2019-06-01",
            "nationality": "France",
            "date_of_birth": dob_old,
        },
    )

    response = user_client.get("/api/v1/members/statistics")
    assert response.status_code == 200
    body = response.json()

    assert body["by_status"] == [
        {"label": "active", "value": 2},
        {"label": "past", "value": 1},
    ]

    assert body["by_join_year"] == [
        {"label": "2019", "value": 1},
        {"label": "2020", "value": 1},
        {"label": "2021", "value": 1},
    ]

    assert body["by_nationality"] == [
        {"label": "France", "value": 2},
        {"label": "UK", "value": 1},
    ]

    assert body["by_classification"] == [
        {"label": "Accounting", "value": 1},
        {"label": "Law", "value": 1},
        {"label": "Unknown", "value": 1},
    ]

    join_ry_2020_03_01 = rotary_year(date(2020, 3, 1))
    join_ry_2021_08_15 = rotary_year(date(2021, 8, 15))
    join_ry_2019_06_01 = rotary_year(date(2019, 6, 1))
    leave_ry_2023_08_20 = rotary_year(date(2023, 8, 20))

    growth_by_year = {entry["label"]: entry for entry in body["growth_by_rotary_year"]}
    assert growth_by_year[str(join_ry_2020_03_01)]["joins"] >= 1
    assert growth_by_year[str(join_ry_2021_08_15)]["joins"] >= 1
    assert growth_by_year[str(join_ry_2019_06_01)]["joins"] >= 1
    assert growth_by_year[str(leave_ry_2023_08_20)]["leaves"] >= 1

    expected_buckets = {
        "<30": 0,
        "30-39": 0,
        "40-49": 0,
        "50-59": 0,
        "60-69": 0,
        "70+": 0,
    }
    expected_buckets[_age_bucket(age_young)] += 1
    expected_buckets[_age_bucket(age_mid)] += 1
    expected_buckets[_age_bucket(age_old)] += 1

    actual_buckets = {entry["label"]: entry["value"] for entry in body["age_distribution"]}
    assert actual_buckets == expected_buckets

    expected_average_age = round((age_young + age_mid + age_old) / 3, 1)
    assert body["average_age"] == pytest.approx(expected_average_age, abs=0.1)

    assert body["average_tenure_years"] is not None
    assert body["average_tenure_years"] > 0
