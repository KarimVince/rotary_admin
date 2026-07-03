import pytest

from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    hash_token,
    verify_password,
)

pytestmark = pytest.mark.unit


def test_hash_password_round_trip():
    hashed = hash_password("correct-horse-battery-staple")

    assert hashed != "correct-horse-battery-staple"
    assert verify_password("correct-horse-battery-staple", hashed) is True
    assert verify_password("wrong-password", hashed) is False


def test_access_token_round_trip():
    token = create_access_token("user-123", "admin")

    payload = decode_access_token(token)

    assert payload["sub"] == "user-123"
    assert payload["role"] == "admin"
    assert payload["type"] == "access"


def test_decode_access_token_rejects_garbage():
    with pytest.raises(ValueError):
        decode_access_token("not-a-real-token")


def test_hash_token_is_deterministic_and_one_way():
    token = "some-refresh-token-value"

    assert hash_token(token) == hash_token(token)
    assert hash_token(token) != token
