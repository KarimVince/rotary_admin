import { useEffect, useState } from "react";
import { Gift, Handshake, ListChecks, Settings2, Users, Wallet } from "lucide-react";
import { getEventSummary } from "../api/eventSummary";
import { useAccess } from "../hooks/useAccess";
import { formatCurrency } from "../utils/formatters";
import SectionLabel from "./SectionLabel";
import { FinanceBlock, FinanceRow } from "./FinanceBlock";
import Card from "./Card";

function NavCard({ icon: Icon, label, onClick, canRead }) {
  if (!canRead) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start gap-[10px] rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-[15px] text-left hover:border-[var(--accent)] hover:bg-[var(--accent-softer)]"
    >
      <span className="event-bento-icon">
        <Icon size={16} aria-hidden="true" />
      </span>
      <span className="text-[14px] font-bold text-[var(--ink,var(--text-h))]">{label}</span>
    </button>
  );
}

const NAV_ITEMS = [
  { key: "guests", label: "Guest List", icon: Users, access: "event.guests" },
  { key: "sponsors", label: "Sponsors", icon: Handshake, access: "event.sponsors" },
  { key: "costs", label: "Operational Cost", icon: Wallet, access: "event.costs" },
  { key: "lucky", label: "Lucky Draw", icon: Gift, access: "event.auction" },
  { key: "rundown", label: "Rundown", icon: ListChecks, access: "event.rundown" },
  { key: "setup", label: "Setup", icon: Settings2, access: "event.setup" },
];

// Story 14.13: Manage Project overview — a flat row of 6 nav cards, then a
// Summary stat row and a Revenue/Costs breakdown, all sourced from
// getEventSummary.
export default function EventManageBento({ eventId, onOpenPanel }) {
  const { canRead: canReadGuests } = useAccess("event.guests");
  const { canRead: canReadSponsors } = useAccess("event.sponsors");
  const { canRead: canReadCosts } = useAccess("event.costs");
  const { canRead: canReadLucky } = useAccess("event.auction");
  const { canRead: canReadRundown } = useAccess("event.rundown");
  const { canRead: canReadSetup } = useAccess("event.setup");
  const { canRead: canReadSummary } = useAccess("event.summary");
  const accessByKey = {
    guests: canReadGuests,
    sponsors: canReadSponsors,
    costs: canReadCosts,
    lucky: canReadLucky,
    rundown: canReadRundown,
    setup: canReadSetup,
  };

  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (!canReadSummary) return;
    getEventSummary(eventId).then(setSummary);
  }, [eventId, canReadSummary]);

  // Fund Raised = money raised through the Lucky Draw & Auction module
  // (ticket sales for the raffle, auction lots, other cash donations) — no
  // cost side is tracked for it, so its "net" card is just the total raised.
  const fundRaisedRows = summary
    ? [
        { label: "Ticket Sale", value: summary.lucky_draw_total },
        { label: "Auction", value: summary.auction_total },
        { label: "Other Donation", value: summary.other_donation },
      ]
    : [];

  // Organization Result = the gala's own P&L: ticket/sponsor revenue from
  // Guest List + Sponsors against Operational Cost's categories — exactly
  // what total_revenue/total_cost/net_operational_result already represent.
  const organizationRevenueRows = summary
    ? [
        { label: "Ticket Sold", value: summary.ticket_revenue },
        { label: "Sponsorship", value: summary.sponsor_revenue },
      ]
    : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="event-nav-grid grid grid-cols-2 gap-[10px] sm:grid-cols-3 lg:grid-cols-6">
        {NAV_ITEMS.map((item) => (
          <NavCard
            key={item.key}
            icon={item.icon}
            label={item.label}
            canRead={accessByKey[item.key]}
            onClick={() => onOpenPanel(item.key)}
          />
        ))}
      </div>

      {canReadSummary && summary && (
        <>
          <SectionLabel>Summary</SectionLabel>
          <div className="event-summary-grid grid grid-cols-1 gap-4 stat-duo-grid sm:grid-cols-2">
            <Card variant="stat-blue" className="flex flex-col">
              <span className="text-3xl font-bold">{formatCurrency(summary.total_raised)}</span>
              <span className="mt-2 text-sm">Fund Raised</span>
            </Card>
            <Card variant="stat-lavender" className="flex flex-col">
              <span className="text-3xl font-bold">{formatCurrency(summary.net_operational_result)}</span>
              <span className="mt-2 text-sm">Organization Result</span>
            </Card>
          </div>

          <SectionLabel>Breakdown</SectionLabel>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FinanceBlock title="Fund Raised">
              <div className="fin-blockhead !border-b-0 !pb-0">
                <span className="fin-mm !text-[13px]">Revenue</span>
              </div>
              {fundRaisedRows.map((row) => (
                <FinanceRow key={row.label} label={row.label} value={formatCurrency(row.value)} />
              ))}
            </FinanceBlock>
            <FinanceBlock title="Organization Result">
              <div className="fin-blockhead !border-b-0 !pb-0">
                <span className="fin-mm !text-[13px]">Revenue</span>
              </div>
              {organizationRevenueRows.map((row) => (
                <FinanceRow key={row.label} label={row.label} value={formatCurrency(row.value)} />
              ))}
              <div className="fin-blockhead">
                <span className="fin-mm !text-[13px]">Cost</span>
              </div>
              {summary.cost_breakdown.length === 0 ? (
                <FinanceRow label="No costs yet" value="—" />
              ) : (
                summary.cost_breakdown.map((row) => (
                  <FinanceRow key={row.label} label={row.label} value={formatCurrency(row.value)} />
                ))
              )}
            </FinanceBlock>
          </div>
        </>
      )}
    </div>
  );
}
