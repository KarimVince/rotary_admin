"""Story 14.10: aggregates every Event module sub-page's data into the
Summary page's cards + chart datasets. One computation, reused by both the
JSON endpoint (live page) and the PDF/PPT report — never duplicated.
"""
import uuid

from sqlalchemy.orm import Session

from app.models import (
    EventCost,
    EventGuest,
    EventItem,
    EventLuckyDrawConfig,
    EventSetup,
    EventSponsor,
)
from app.schemas.event_summary import EventSummary, LabelValue


def compute_event_summary(db: Session, event_id: uuid.UUID) -> EventSummary:
    setup = db.query(EventSetup).filter(EventSetup.event_id == event_id).first()
    ticket_price_normal = float(setup.ticket_price_normal) if setup and setup.ticket_price_normal else 0.0
    ticket_price_early_bird = (
        float(setup.ticket_price_early_bird) if setup and setup.ticket_price_early_bird else 0.0
    )
    lucky_draw_ticket_price = (
        float(setup.lucky_draw_ticket_price) if setup and setup.lucky_draw_ticket_price else 0.0
    )

    config = db.query(EventLuckyDrawConfig).filter(EventLuckyDrawConfig.event_id == event_id).first()
    tickets_sold = config.tickets_sold if config else 0
    other_donation = float(config.other_donation) if config else 0.0

    items = db.query(EventItem).filter(EventItem.event_id == event_id).all()
    auction_total = sum(float(i.value_sold) for i in items if i.item_type == "auction" and i.value_sold is not None)
    lucky_draw_total = lucky_draw_ticket_price * tickets_sold
    total_raised = auction_total + lucky_draw_total + other_donation

    guests = db.query(EventGuest).filter(EventGuest.event_id == event_id).all()
    early_bird_count = sum(1 for g in guests if g.early_bird)
    normal_count = len(guests) - early_bird_count
    ticket_revenue = ticket_price_normal * normal_count + ticket_price_early_bird * early_bird_count

    sponsors = db.query(EventSponsor).filter(EventSponsor.event_id == event_id).all()
    sponsor_revenue = sum(float(s.total_cost) for s in sponsors)

    total_revenue = ticket_revenue + sponsor_revenue

    costs = db.query(EventCost).filter(EventCost.event_id == event_id).all()
    cost_by_category: dict[str, float] = {}
    for cost in costs:
        key = cost.category or "Uncategorised"
        cost_by_category[key] = cost_by_category.get(key, 0.0) + float(cost.total_cost)
    total_cost = sum(cost_by_category.values())
    cost_per_category = [
        LabelValue(label=category, value=total) for category, total in sorted(cost_by_category.items())
    ]

    net_operational_result = total_revenue - total_cost

    return EventSummary(
        total_raised=total_raised,
        auction_total=auction_total,
        lucky_draw_total=lucky_draw_total,
        other_donation=other_donation,
        total_revenue=total_revenue,
        ticket_revenue=ticket_revenue,
        sponsor_revenue=sponsor_revenue,
        total_cost=total_cost,
        cost_per_category=cost_per_category,
        net_operational_result=net_operational_result,
        revenue_breakdown=[
            LabelValue(label="Ticket Revenue", value=ticket_revenue),
            LabelValue(label="Sponsor Revenue", value=sponsor_revenue),
            LabelValue(label="Fundraising Total", value=total_raised),
        ],
        cost_breakdown=cost_per_category,
        result_overview=[
            LabelValue(label="Revenue", value=total_revenue),
            LabelValue(label="Total Cost", value=total_cost),
            LabelValue(label="Net Result", value=net_operational_result),
        ],
    )
