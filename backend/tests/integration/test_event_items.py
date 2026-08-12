from datetime import date, timedelta

import pytest

pytestmark = pytest.mark.integration

FUTURE = date.today() + timedelta(days=30)


@pytest.fixture
def event_id(admin_client):
    create = admin_client.post(
        "/api/v1/events",
        json={"name": "Annual Ball", "date": str(FUTURE), "venue": "Grand Hotel"},
    )
    return create.json()["id"]


def test_lot_ref_shared_lucky_draw_pool_keeps_ls_tag_but_shares_the_number(admin_client, event_id):
    # 2026-08-11 (twice): auction keeps its own "A" sequence. The two
    # lucky-draw subtypes share one NUMBER pool, but each keeps its own
    # printed tag — on-stage is still "LS", regular is still "L". On-stage
    # items form the front block of the shared pool, regular items the
    # back block (continuing the count, not resetting to 1), each block
    # internally ordered by value_hkd descending. The block a item is in
    # always wins over raw value, even across blocks.
    auction_1 = admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "Painting", "item_type": "auction", "value_hkd": 1000},
    )
    assert auction_1.json()["lot_ref"] == "A-1"
    assert auction_1.json()["lot_ref_overridden"] is False

    on_stage_1 = admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "Watch", "item_type": "lucky_draw_on_stage", "value_hkd": 500},
    )
    assert on_stage_1.json()["lot_ref"] == "LS-1"

    regular_1 = admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "Voucher", "item_type": "lucky_draw", "value_hkd": 100000},
    )
    # Regular items are the second block of the shared pool, so Voucher
    # continues the count at L-2 even though its value (100000) massively
    # outstrips Watch's (500) — the on-stage/regular block ordering wins
    # over value here, and the number doesn't reset just because the tag
    # changed from LS to L.
    assert regular_1.json()["lot_ref"] == "L-2"

    # A higher-value auction item created afterwards takes A-1, bumping the
    # first (lower-value) auction item down to A-2 — lot_ref defaults to
    # value-descending position within the group, not insertion order.
    auction_2 = admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "Sculpture", "item_type": "auction", "value_hkd": 2000},
    )
    assert auction_2.json()["lot_ref"] == "A-1"

    listing = {i["name"]: i["lot_ref"] for i in admin_client.get(f"/api/v1/events/{event_id}/items").json()}
    assert listing["Sculpture"] == "A-1"
    assert listing["Painting"] == "A-2"
    assert listing["Watch"] == "LS-1"
    assert listing["Voucher"] == "L-2"


def test_list_sorted_by_type_group_then_value_descending(admin_client, event_id):
    admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "Cheap Auction", "item_type": "auction", "value_hkd": 100},
    )
    admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "Expensive Auction", "item_type": "auction", "value_hkd": 5000},
    )
    admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "On Stage", "item_type": "lucky_draw_on_stage", "value_hkd": 300},
    )
    admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "Regular", "item_type": "lucky_draw", "value_hkd": 900},
    )

    listing = admin_client.get(f"/api/v1/events/{event_id}/items").json()
    names = [i["name"] for i in listing]
    # Auction group first (desc value), then the shared lucky-draw group's
    # on-stage block, then its regular block — regardless of the fact
    # "Regular" has a higher value than "On Stage".
    assert names == ["Expensive Auction", "Cheap Auction", "On Stage", "Regular"]


def test_update_and_delete_item(admin_client, event_id, make_member):
    contact = make_member(first_name="Rotary", last_name="Contact")
    create = admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={
            "name": "Painting",
            "item_type": "auction",
            "value_hkd": 1000,
            "contact_rotary_id": str(contact.id),
        },
    )
    item_id = create.json()["id"]
    assert create.json()["contact_rotary_name"] == "Rotary Contact"

    update = admin_client.patch(
        f"/api/v1/events/{event_id}/items/{item_id}",
        json={"status": "received", "value_sold": 1500},
    )
    assert update.status_code == 200
    assert update.json()["status"] == "received"
    assert update.json()["value_sold"] == 1500
    # status/value_sold updates don't touch lot_ref — only value_hkd,
    # item_type, or an explicit lot_ref override recalculate it.
    assert update.json()["lot_ref"] == "A-1"

    delete = admin_client.delete(f"/api/v1/events/{event_id}/items/{item_id}")
    assert delete.status_code == 204


def test_value_hkd_change_resyncs_group_to_value_order(admin_client, event_id):
    low = admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "Low", "item_type": "auction", "value_hkd": 100},
    ).json()
    high = admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "High", "item_type": "auction", "value_hkd": 1000},
    ).json()
    assert high["lot_ref"] == "A-1"
    # `low` is the POST response captured *before* High was created and
    # recomputed the group — re-fetch for current state rather than
    # trusting that stale snapshot.
    listing_before = {i["name"]: i["lot_ref"] for i in admin_client.get(f"/api/v1/events/{event_id}/items").json()}
    assert listing_before == {"High": "A-1", "Low": "A-2"}

    # Bump Low's value above High's — the whole group re-syncs, Low takes
    # A-1 and High drops to A-2.
    updated = admin_client.patch(
        f"/api/v1/events/{event_id}/items/{low['id']}",
        json={"value_hkd": 5000},
    )
    assert updated.json()["lot_ref"] == "A-1"
    assert updated.json()["lot_ref_overridden"] is False

    listing = {i["name"]: i["lot_ref"] for i in admin_client.get(f"/api/v1/events/{event_id}/items").json()}
    assert listing["Low"] == "A-1"
    assert listing["High"] == "A-2"


def test_lot_ref_manual_override_inserts_and_shifts(admin_client, event_id):
    a = admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "A", "item_type": "auction", "value_hkd": 300},
    ).json()
    b = admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "B", "item_type": "auction", "value_hkd": 200},
    ).json()
    c = admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "C", "item_type": "auction", "value_hkd": 100},
    ).json()
    # Default value order: A(300)=A-1, B(200)=A-2, C(100)=A-3.
    before = {i["name"]: i["lot_ref"] for i in admin_client.get(f"/api/v1/events/{event_id}/items").json()}
    assert before == {"A": "A-1", "B": "A-2", "C": "A-3"}

    # Force C to A-1 — B and A shift down (A-1 -> A-2 -> A-3), only C is
    # marked as overridden.
    moved = admin_client.patch(
        f"/api/v1/events/{event_id}/items/{c['id']}",
        json={"lot_ref": "A-1"},
    )
    assert moved.status_code == 200
    assert moved.json()["lot_ref"] == "A-1"
    assert moved.json()["lot_ref_overridden"] is True

    after_listing = admin_client.get(f"/api/v1/events/{event_id}/items").json()
    after = {i["name"]: i["lot_ref"] for i in after_listing}
    assert after == {"C": "A-1", "A": "A-2", "B": "A-3"}
    overridden = {i["name"]: i["lot_ref_overridden"] for i in after_listing}
    assert overridden == {"C": True, "A": False, "B": False}
    # C is the lowest-value item (100, vs A's 300 and B's 200) but the
    # override put it at A-1 — the list's row order must follow the
    # current lot number, not raw value_hkd, or the on-screen order would
    # contradict the lot ref labels next to each row.
    assert [i["name"] for i in after_listing] == ["C", "A", "B"]

    # A later value_hkd change anywhere in the group re-syncs the whole
    # group back to pure value order, clearing the override.
    admin_client.patch(f"/api/v1/events/{event_id}/items/{a['id']}", json={"value_hkd": 300})
    final = admin_client.get(f"/api/v1/events/{event_id}/items").json()
    final_by_name = {i["name"]: (i["lot_ref"], i["lot_ref_overridden"]) for i in final}
    assert final_by_name == {"A": ("A-1", False), "B": ("A-2", False), "C": ("A-3", False)}


def test_item_type_change_within_shared_pool_reorders_by_subtype_block(admin_client, event_id):
    on_stage = admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "Watch", "item_type": "lucky_draw_on_stage", "value_hkd": 500},
    ).json()
    admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "Voucher", "item_type": "lucky_draw", "value_hkd": 100},
    )
    listing_before = {i["name"]: i["lot_ref"] for i in admin_client.get(f"/api/v1/events/{event_id}/items").json()}
    # Watch is on-stage (front block) so it's LS-1 even though it's not the
    # only item in the shared pool; Voucher (regular, back block) continues
    # the same count at L-2.
    assert listing_before == {"Watch": "LS-1", "Voucher": "L-2"}

    # Reclassify Watch from lucky_draw_on_stage to lucky_draw — it stays in
    # the same shared pool (still 2 items total) but moves from the front
    # block to the back block (and its tag switches from LS to L), so the
    # whole pool re-sorts by (block, value): both items are now "regular",
    # so it's pure value order and Watch (500 > 100) takes L-1, pushing
    # Voucher to L-2 — there's no on-stage item left to anchor a front
    # block, so the count restarts at 1 for the sole remaining block.
    moved = admin_client.patch(
        f"/api/v1/events/{event_id}/items/{on_stage['id']}",
        json={"item_type": "lucky_draw"},
    )
    assert moved.json()["lot_ref"] == "L-1"

    listing_after = {i["name"]: i["lot_ref"] for i in admin_client.get(f"/api/v1/events/{event_id}/items").json()}
    assert listing_after == {"Watch": "L-1", "Voucher": "L-2"}


@pytest.mark.parametrize(
    ("destination_type", "destination_prefix"),
    [("lucky_draw", "L"), ("lucky_draw_on_stage", "LS")],
)
def test_item_type_change_renumbers_the_group_left_behind(
    admin_client, event_id, destination_type, destination_prefix
):
    admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "A", "item_type": "auction", "value_hkd": 300},
    ).json()
    b = admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "B", "item_type": "auction", "value_hkd": 200},
    ).json()
    admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "C", "item_type": "auction", "value_hkd": 100},
    ).json()
    before = {i["name"]: i["lot_ref"] for i in admin_client.get(f"/api/v1/events/{event_id}/items").json()}
    assert before == {"A": "A-1", "B": "A-2", "C": "A-3"}

    # Move the middle item (B) out of the auction group entirely into the
    # shared lucky-draw pool — the two that stayed behind (A, C) must close
    # the gap, not keep their old numbers (A-1, A-3) with a hole where B
    # used to be. Covers both lucky-draw destinations — B is the only item
    # in the shared pool either way, so it takes position 1 under its own
    # destination-specific tag (LS or L).
    moved = admin_client.patch(
        f"/api/v1/events/{event_id}/items/{b['id']}",
        json={"item_type": destination_type},
    )
    assert moved.json()["lot_ref"] == f"{destination_prefix}-1"

    after = {i["name"]: i["lot_ref"] for i in admin_client.get(f"/api/v1/events/{event_id}/items").json()}
    assert after == {"A": "A-1", "C": "A-2", "B": f"{destination_prefix}-1"}


def test_delete_item_closes_the_gap_in_its_group(admin_client, event_id):
    admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "A", "item_type": "auction", "value_hkd": 300},
    )
    b = admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "B", "item_type": "auction", "value_hkd": 200},
    ).json()
    admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "C", "item_type": "auction", "value_hkd": 100},
    )
    before = {i["name"]: i["lot_ref"] for i in admin_client.get(f"/api/v1/events/{event_id}/items").json()}
    assert before == {"A": "A-1", "B": "A-2", "C": "A-3"}

    # Deleting the middle item used to leave a gap (A-1, A-3, no A-2) —
    # the remaining items must close it, same as a type-change moving an
    # item out of the group.
    delete = admin_client.delete(f"/api/v1/events/{event_id}/items/{b['id']}")
    assert delete.status_code == 204

    after = {i["name"]: i["lot_ref"] for i in admin_client.get(f"/api/v1/events/{event_id}/items").json()}
    assert after == {"A": "A-1", "C": "A-2"}


def test_lot_ref_override_rejects_wrong_prefix_and_bad_format(admin_client, event_id):
    auction_item = admin_client.post(
        f"/api/v1/events/{event_id}/items",
        json={"name": "Painting", "item_type": "auction", "value_hkd": 1000},
    ).json()

    wrong_prefix = admin_client.patch(
        f"/api/v1/events/{event_id}/items/{auction_item['id']}",
        json={"lot_ref": "L-1"},
    )
    assert wrong_prefix.status_code == 422

    bad_format = admin_client.patch(
        f"/api/v1/events/{event_id}/items/{auction_item['id']}",
        json={"lot_ref": "A-abc"},
    )
    assert bad_format.status_code == 422

    zero = admin_client.patch(
        f"/api/v1/events/{event_id}/items/{auction_item['id']}",
        json={"lot_ref": "A-0"},
    )
    assert zero.status_code == 422


def test_lucky_draw_config_defaults_and_upsert(admin_client, event_id):
    default = admin_client.get(f"/api/v1/events/{event_id}/lucky-draw-config")
    assert default.status_code == 200
    assert default.json()["tickets_sold"] == 0
    assert default.json()["other_donation"] == 0

    first = admin_client.put(
        f"/api/v1/events/{event_id}/lucky-draw-config",
        json={"tickets_sold": 50, "other_donation": 200},
    )
    assert first.status_code == 200
    assert first.json()["tickets_sold"] == 50

    second = admin_client.put(
        f"/api/v1/events/{event_id}/lucky-draw-config",
        json={"tickets_sold": 75, "other_donation": 300},
    )
    assert second.json()["tickets_sold"] == 75
    assert second.json()["other_donation"] == 300


def test_user_without_access_is_forbidden(user_client, event_id):
    response = user_client.get(f"/api/v1/events/{event_id}/items")
    assert response.status_code == 403


def test_chained_type_moves_keep_groups_gapless_and_reorder_within_shared_group(admin_client, event_id):
    # Mirrors a realistic mix: several items already in each group before a
    # single item is round-tripped Auction -> On Stage -> Regular ->
    # Auction. Crossing the Auction <-> shared-lucky-draw boundary must
    # keep both sides gapless at every step; moving between the two
    # lucky-draw subtypes stays inside the same shared group, so its total
    # size must NOT change — only the item's block (and so its position)
    # does.
    for i in range(3):
        admin_client.post(
            f"/api/v1/events/{event_id}/items",
            json={"name": f"Auction{i}", "item_type": "auction", "value_hkd": 1000 - i},
        )
    for i in range(3):
        admin_client.post(
            f"/api/v1/events/{event_id}/items",
            json={"name": f"OnStage{i}", "item_type": "lucky_draw_on_stage", "value_hkd": 500 - i},
        )
    for i in range(3):
        admin_client.post(
            f"/api/v1/events/{event_id}/items",
            json={"name": f"Regular{i}", "item_type": "lucky_draw", "value_hkd": 200 - i},
        )

    def numbers(item_types):
        listing = admin_client.get(f"/api/v1/events/{event_id}/items").json()
        return sorted(
            int(i["lot_ref"].rsplit("-", 1)[1]) for i in listing if i["item_type"] in item_types
        )

    listing = admin_client.get(f"/api/v1/events/{event_id}/items").json()
    mover = next(i for i in listing if i["name"] == "Auction0")
    lucky_draw_types = ["lucky_draw_on_stage", "lucky_draw"]

    # Shared group starts at 6 (3 on-stage + 3 regular, one sequence).
    # Auction -> On Stage: crosses into the shared group (6 -> 7 there),
    # auction shrinks from 3 -> 2, both gapless.
    admin_client.patch(f"/api/v1/events/{event_id}/items/{mover['id']}", json={"item_type": "lucky_draw_on_stage"})
    assert numbers(["auction"]) == [1, 2]
    assert numbers(lucky_draw_types) == [1, 2, 3, 4, 5, 6, 7]

    # On Stage -> Regular: stays inside the shared group — still 7 items,
    # no gap, no size change; auction untouched.
    admin_client.patch(f"/api/v1/events/{event_id}/items/{mover['id']}", json={"item_type": "lucky_draw"})
    assert numbers(lucky_draw_types) == [1, 2, 3, 4, 5, 6, 7]
    assert numbers(["auction"]) == [1, 2]

    # Regular -> Auction: crosses back out, shared group shrinks 7 -> 6,
    # auction grows 2 -> 3, both gapless.
    admin_client.patch(f"/api/v1/events/{event_id}/items/{mover['id']}", json={"item_type": "auction"})
    assert numbers(lucky_draw_types) == [1, 2, 3, 4, 5, 6]
    assert numbers(["auction"]) == [1, 2, 3]
