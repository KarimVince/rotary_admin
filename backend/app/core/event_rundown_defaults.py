"""Story 14.11: default rundown template auto-seeded for every new event —
matches the structure of the example rundown ("Rundown gala 2025-2026 v1.pdf",
not present in this repo, per the story's own description). A starting
point only — every row is editable/deletable from the moment of creation.
"""

DEFAULT_RUNDOWN_TEMPLATE = [
    ("Before 7:30 PM", "Welcoming guests - Cocktail", False),
    ("7:30 PM", "Ring Bell, guest walk to their seat", True),
    ("7:45 PM", "Rotarian walk at the stand", False),
    ("7:53 PM", "MC Welcoming President, DG and Rotarians on stage", False),
    ("7:55 PM", "President's short speech / DG's short speech", False),
    ("8:00 PM", "MC explaining Lucky draw and Live Auction / MC Announcing Dance Performance", False),
    ("8:05 PM", "Dance performance (7-10 min)", False),
    ("8:20 PM", "Dinner Buffet served - Starter", True),
    ("8:25 PM", "MC following up on lucky draw and auction / MC announcing music solo", False),
    ("8:45 PM", "Main course buffet", True),
    ("8:55 PM", "MC last call for Lucky draw", False),
    ("9:00 PM", "MC announce end of Ticket Sale for Lucky draw", False),
    ("9:10 PM", "Lucky draw drawing - On Stage prizes", False),
    ("9:25 PM", "Live auction (10-15 min)", False),
    ("9:25 PM", "Dinner dessert buffet", True),
    ("9:35 PM", "MC inviting guests to pick up lucky draw prizes / MC announcing Singer", False),
    ("10:30 PM", "Ball Start", False),
    ("11:55 PM", "End of ball", False),
    ("12:00 AM", "Room empty", False),
]
