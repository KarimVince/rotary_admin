import pytest

pytestmark = pytest.mark.integration


def test_create_then_get_rotary_friend_round_trip(admin_client):
    create_response = admin_client.post(
        "/api/v1/rotary-friends",
        json={
            "first_name": "Sara",
            "last_name": "Nguyen",
            "email": "sara@example.com",
            "whatsapp": "+33612345678",
            "tags": "donor,alumni",
            "source": "Charity gala 2024",
        },
    )
    assert create_response.status_code == 201
    created = create_response.json()
    assert created["first_name"] == "Sara"
    assert created["whatsapp"] == "+33612345678"

    get_response = admin_client.get(f"/api/v1/rotary-friends/{created['id']}")
    assert get_response.status_code == 200
    assert get_response.json()["tags"] == "donor,alumni"


def test_create_rotary_friend_requires_email_or_whatsapp(admin_client):
    response = admin_client.post(
        "/api/v1/rotary-friends", json={"first_name": "No", "last_name": "Contact"}
    )
    assert response.status_code == 422


def test_create_rotary_friend_rejects_invalid_whatsapp_format(admin_client):
    response = admin_client.post(
        "/api/v1/rotary-friends",
        json={"first_name": "Bad", "last_name": "Number", "whatsapp": "0612345678"},
    )
    assert response.status_code == 422


def test_create_rotary_friend_accepts_whatsapp_only(admin_client):
    response = admin_client.post(
        "/api/v1/rotary-friends",
        json={"first_name": "Whats", "last_name": "App", "whatsapp": "+85298765432"},
    )
    assert response.status_code == 201


def test_list_rotary_friends_requires_authentication(client):
    response = client.get("/api/v1/rotary-friends")
    assert response.status_code == 401


def test_user_can_read_rotary_friends(user_client, make_rotary_friend):
    make_rotary_friend(first_name="Readable")
    response = user_client.get("/api/v1/rotary-friends")
    assert response.status_code == 200
    names = [f["first_name"] for f in response.json()]
    assert "Readable" in names


def test_non_admin_cannot_create_rotary_friend(user_client):
    response = user_client.post(
        "/api/v1/rotary-friends",
        json={"first_name": "No", "last_name": "Perm", "email": "no@example.com"},
    )
    assert response.status_code == 403


def test_treasurer_cannot_create_rotary_friend(treasurer_client):
    response = treasurer_client.post(
        "/api/v1/rotary-friends",
        json={"first_name": "No", "last_name": "Perm", "email": "no@example.com"},
    )
    assert response.status_code == 403


def test_search_rotary_friends_by_name(admin_client, make_rotary_friend):
    make_rotary_friend(first_name="Alex", last_name="Martin", email="alex@example.com")
    make_rotary_friend(first_name="Jamie", last_name="Lee", email="jamie@example.com")

    response = admin_client.get("/api/v1/rotary-friends", params={"search": "martin"})
    assert response.status_code == 200
    names = [f["first_name"] for f in response.json()]
    assert names == ["Alex"]


def test_search_rotary_friends_by_tag(admin_client):
    admin_client.post(
        "/api/v1/rotary-friends",
        json={
            "first_name": "Tagged",
            "last_name": "Friend",
            "email": "tagged@example.com",
            "tags": "sponsor",
        },
    )

    response = admin_client.get("/api/v1/rotary-friends", params={"search": "sponsor"})
    assert response.status_code == 200
    names = [f["first_name"] for f in response.json()]
    assert names == ["Tagged"]


def test_admin_can_update_rotary_friend(admin_client, make_rotary_friend):
    friend = make_rotary_friend(first_name="Old")
    response = admin_client.patch(
        f"/api/v1/rotary-friends/{friend.id}", json={"first_name": "New"}
    )
    assert response.status_code == 200
    assert response.json()["first_name"] == "New"


def test_update_rotary_friend_rejects_removing_last_contact_method(
    admin_client, make_rotary_friend
):
    friend = make_rotary_friend(first_name="OnlyEmail", email="only@example.com")
    response = admin_client.patch(
        f"/api/v1/rotary-friends/{friend.id}", json={"email": None}
    )
    assert response.status_code == 422


def test_update_rotary_friend_not_found_returns_404(admin_client):
    response = admin_client.patch(
        "/api/v1/rotary-friends/00000000-0000-0000-0000-000000000000",
        json={"first_name": "x"},
    )
    assert response.status_code == 404


def test_non_admin_cannot_update_rotary_friend(user_client, make_rotary_friend):
    friend = make_rotary_friend()
    response = user_client.patch(
        f"/api/v1/rotary-friends/{friend.id}", json={"first_name": "x"}
    )
    assert response.status_code == 403


def test_admin_can_delete_rotary_friend(admin_client, make_rotary_friend):
    friend = make_rotary_friend()
    response = admin_client.delete(f"/api/v1/rotary-friends/{friend.id}")
    assert response.status_code == 204

    get_response = admin_client.get(f"/api/v1/rotary-friends/{friend.id}")
    assert get_response.status_code == 404


def test_non_admin_cannot_delete_rotary_friend(user_client, make_rotary_friend):
    friend = make_rotary_friend()
    response = user_client.delete(f"/api/v1/rotary-friends/{friend.id}")
    assert response.status_code == 403


def test_delete_rotary_friend_not_found_returns_404(admin_client):
    response = admin_client.delete(
        "/api/v1/rotary-friends/00000000-0000-0000-0000-000000000000"
    )
    assert response.status_code == 404
