"""Shared footer appended to emails sent to an actual club member or
applicant — Members Email broadcast, Fee invoice emails, and New Member
Application emails. Deliberately NOT used for Rotary Friends Email (Friends
aren't registered club members, so the wording below wouldn't be accurate
for them) or system/account emails (password reset, account email-change
verification — see app/api/auth.py / app/api/account.py), which are
transactional rather than club communications."""

MEMBER_EMAIL_FOOTER_HTML = (
    '<p style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e2e2;'
    'font-size:11px;line-height:1.5;color:#888888;">'
    "This communication is issued by the Discovery Bay Club Administration Tool "
    "pursuant to your registration as a club member."
    "</p>"
)
