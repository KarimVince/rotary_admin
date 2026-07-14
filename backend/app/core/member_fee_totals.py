"""Shared "amount collected" logic for a MemberFee (Story 15.10).

Single source of truth for both `GET /member-fees/statistics` (the Fees
module) and `GET /dashboard/summary` (the Dashboard's "Fees Collected"
card) — they must never diverge again.
"""

from collections.abc import Iterable

from app.models import MemberFee


def fee_collected_amount(fee: MemberFee) -> float:
    """The actual amount received for a paid fee — amount_paid when it was
    amended at payment validation, falling back to the standard invoiced
    amount_due otherwise. amount_due itself is never overwritten."""
    return float(fee.amount_paid if fee.amount_paid is not None else fee.amount_due)


def total_collected(fees: Iterable[MemberFee]) -> float:
    return sum(fee_collected_amount(fee) for fee in fees if fee.is_paid)
