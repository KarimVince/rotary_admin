import pytest

from app.core.member_application_pdf import build_member_application_pdf

pytestmark = pytest.mark.unit


def test_produces_a_valid_pdf():
    pdf = build_member_application_pdf("Jane Doe", "jane@example.com", "+85212345678")

    assert pdf[:4] == b"%PDF"


def test_position_field_is_dropped():
    # Story 15.5 — "position" is explicitly excluded, and has no backing
    # Member DB column anyway.
    pdf = build_member_application_pdf("Jane Doe", None, None)

    assert b"(position)" not in pdf


def test_new_fields_present():
    # Story 15.5 — Gender and Occupation/Profession are on the Member model
    # and are explicitly listed in the story's field list.
    pdf = build_member_application_pdf("Jane Doe", None, None)

    assert b"(gender)" in pdf
    assert b"(profession)" in pdf


def test_signature_is_not_an_interactive_field():
    # Story 15.5 — signature must render as a static underline, not an
    # AcroForm field (unlike every other field, which stays fillable).
    pdf = build_member_application_pdf("Jane Doe", None, None)

    assert b"(signature)" not in pdf
    assert b"(date)" in pdf


def test_handles_missing_email_and_phone():
    pdf = build_member_application_pdf("Minimal Prospect", None, None)

    assert pdf[:4] == b"%PDF"
