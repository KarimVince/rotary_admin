import pytest

pytestmark = pytest.mark.unit


def test_deploy_gate_deliberately_fails():
    """Story 6.6 verification: a throwaway failing test to confirm CI blocks
    the production deploy step. Removed immediately after confirming."""
    assert False, "deliberate failure to verify the deploy gate"
