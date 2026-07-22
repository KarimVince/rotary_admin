import pytest

pytestmark = pytest.mark.integration


def _draft(source_module="members", **overrides):
    payload = {"source_module": source_module, "subject": "Hi", "body": "Hello there"}
    payload.update(overrides)
    return payload


def test_create_and_list_member_draft(admin_client, make_member):
    member = make_member()
    response = admin_client.post(
        "/api/v1/email-drafts",
        json=_draft(member_ids=[str(member.id)]),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["source_module"] == "members"
    assert body["subject"] == "Hi"
    assert body["member_ids"] == [str(member.id)]
    assert body["created_at"] is not None

    listed = admin_client.get("/api/v1/email-drafts", params={"source_module": "members"})
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["id"] == body["id"]


def test_create_and_list_rotary_friend_draft(admin_client, make_rotary_friend):
    friend = make_rotary_friend()
    response = admin_client.post(
        "/api/v1/email-drafts",
        json=_draft(source_module="rotary_friends", friend_ids=[str(friend.id)]),
    )
    assert response.status_code == 201
    assert response.json()["friend_ids"] == [str(friend.id)]

    listed = admin_client.get("/api/v1/email-drafts", params={"source_module": "rotary_friends"})
    assert listed.status_code == 200
    assert len(listed.json()) == 1


def test_drafts_are_scoped_by_module(admin_client, make_member, make_rotary_friend):
    member = make_member()
    friend = make_rotary_friend()
    admin_client.post("/api/v1/email-drafts", json=_draft(member_ids=[str(member.id)]))
    admin_client.post(
        "/api/v1/email-drafts",
        json=_draft(source_module="rotary_friends", friend_ids=[str(friend.id)]),
    )

    members_drafts = admin_client.get(
        "/api/v1/email-drafts", params={"source_module": "members"}
    ).json()
    friends_drafts = admin_client.get(
        "/api/v1/email-drafts", params={"source_module": "rotary_friends"}
    ).json()
    assert len(members_drafts) == 1
    assert len(friends_drafts) == 1


def test_update_draft_subject_and_body(admin_client, make_member):
    member = make_member()
    created = admin_client.post(
        "/api/v1/email-drafts", json=_draft(member_ids=[str(member.id)])
    ).json()

    response = admin_client.patch(
        f"/api/v1/email-drafts/{created['id']}",
        json={"subject": "Updated subject", "body": "Updated body"},
    )
    assert response.status_code == 200
    assert response.json()["subject"] == "Updated subject"
    assert response.json()["body"] == "Updated body"


def test_update_draft_not_found_returns_404(admin_client):
    response = admin_client.patch(
        "/api/v1/email-drafts/00000000-0000-0000-0000-000000000000",
        json={"subject": "x"},
    )
    assert response.status_code == 404


def test_delete_draft(admin_client, make_member):
    member = make_member()
    created = admin_client.post(
        "/api/v1/email-drafts", json=_draft(member_ids=[str(member.id)])
    ).json()

    response = admin_client.delete(f"/api/v1/email-drafts/{created['id']}")
    assert response.status_code == 204

    remaining = admin_client.get(
        "/api/v1/email-drafts", params={"source_module": "members"}
    ).json()
    assert remaining == []


def test_non_admin_cannot_create_member_draft(user_client):
    response = user_client.post("/api/v1/email-drafts", json=_draft(recipient_group="all"))
    assert response.status_code == 403


def test_non_admin_cannot_list_member_drafts(user_client):
    response = user_client.get("/api/v1/email-drafts", params={"source_module": "members"})
    assert response.status_code == 403


def test_drafts_are_scoped_to_their_creator(admin_client, treasurer_client, make_member, make_permission_matrix_entry, make_app_function):
    # Grant the treasurer write access to members.email so both clients can
    # create drafts, then confirm the treasurer never sees the admin's draft.
    app_function = make_app_function(key="members.email", label="Members — Email")
    make_permission_matrix_entry(
        app_function.id, board_position_id=None, access_level="write", is_default_user=True
    )
    member = make_member()
    admin_client.post("/api/v1/email-drafts", json=_draft(member_ids=[str(member.id)]))

    treasurer_drafts = treasurer_client.get(
        "/api/v1/email-drafts", params={"source_module": "members"}
    )
    assert treasurer_drafts.status_code == 200
    assert treasurer_drafts.json() == []
