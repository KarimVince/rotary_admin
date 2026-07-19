import { useEffect, useState } from "react";
import {
  Building2,
  ChartPie,
  ListChecks,
  Settings,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";
import { getEventSetup, listEventCostCategories, listTableMapping } from "../api/eventSetup";
import { listEventGuests } from "../api/eventGuests";
import { listEventSponsors } from "../api/eventSponsors";
import { listEventCosts } from "../api/eventCosts";
import { getLuckyDrawConfig, listEventItems } from "../api/eventItems";
import { listEventRundown } from "../api/eventRundown";
import { getEventSummary } from "../api/eventSummary";
import { useAccess } from "../hooks/useAccess";
import { formatCurrency, formatDate } from "../utils/formatters";
import Card from "./Card";

function BentoCard({ icon: Icon, title, linkLabel, onLinkClick, canRead, className = "", children }) {
  return (
    <Card variant="default" className={`flex flex-col gap-3 p-[22px] ${className}`.trim()}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={18} className="text-[var(--color-brand-blue)]" />
          <h3 className="text-[15px] font-bold text-[#0c2340]">{title}</h3>
        </div>
        {canRead && (
          <button
            type="button"
            onClick={onLinkClick}
            className="bg-transparent p-0 text-[12px] font-semibold text-[var(--color-brand-blue)]"
          >
            {linkLabel} →
          </button>
        )}
      </div>
      {canRead ? (
        children
      ) : (
        <p className="text-[13px] text-[var(--color-muted-text)]">No permission to view.</p>
      )}
    </Card>
  );
}

function StatTile({ bg, color, value, label }) {
  return (
    <div className="rounded-xl p-[14px]" style={{ background: bg }}>
      <span className="block text-[20px] font-bold" style={{ color }}>
        {value}
      </span>
      <span className="text-[12px] text-[#3c4655]">{label}</span>
    </div>
  );
}

function StatPair({ value, label, color = "#0c2340" }) {
  return (
    <div>
      <span className="block text-[22px] font-bold" style={{ color }}>
        {value}
      </span>
      <span className="text-[12px] text-[var(--color-muted-text)]">{label}</span>
    </div>
  );
}

function SummaryCard({ eventId, onOpen }) {
  const { canRead } = useAccess("event.summary");
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (!canRead) return;
    getEventSummary(eventId).then(setSummary);
  }, [eventId, canRead]);

  return (
    <BentoCard icon={ChartPie} title="Summary" linkLabel="Full report" onLinkClick={onOpen} canRead={canRead}>
      {summary && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatTile
              bg="var(--tone-teal-bg)"
              color="var(--color-tone-teal-text)"
              value={formatCurrency(summary.total_revenue)}
              label="Total income"
            />
            <StatTile
              bg="var(--tone-rose-bg)"
              color="var(--color-tone-rose-text)"
              value={formatCurrency(summary.total_cost)}
              label="Total cost"
            />
            <StatTile
              bg="var(--tone-blue-bg)"
              color="var(--color-brand-blue)"
              value={formatCurrency(summary.net_operational_result)}
              label="Net proceeds"
            />
          </div>
          <div className="flex h-[70px] items-end gap-[6px] px-1">
            <div className="h-[55%] flex-1 rounded-t bg-[var(--tone-blue-bg)]" />
            <div className="h-[80%] flex-1 rounded-t bg-[var(--color-brand-blue-chip)]" />
            <div className="h-full flex-1 rounded-t bg-[var(--color-brand-blue)]" />
            <div className="h-[40%] flex-1 rounded-t bg-[var(--color-brand-blue-chip)]" />
            <div className="h-[65%] flex-1 rounded-t bg-[var(--tone-blue-bg)]" />
          </div>
        </>
      )}
    </BentoCard>
  );
}

function SetupCard({ eventId, onOpen }) {
  const { canRead } = useAccess("event.setup");
  const [setup, setSetup] = useState(null);
  const [categoryCount, setCategoryCount] = useState(0);

  useEffect(() => {
    if (!canRead) return;
    getEventSetup(eventId).then(setSetup);
    listEventCostCategories().then((cats) => setCategoryCount(cats.length));
  }, [eventId, canRead]);

  return (
    <BentoCard icon={Settings} title="Event Setup" linkLabel="Edit" onLinkClick={onOpen} canRead={canRead}>
      {setup && (
        <div className="flex flex-col gap-2 text-[13px]">
          <div className="flex justify-between">
            <span className="text-[var(--color-muted-text)]">Ticket (normal)</span>
            <span className="font-semibold text-[#0c2340]">
              {setup.ticket_price_normal != null ? formatCurrency(setup.ticket_price_normal) : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-muted-text)]">Ticket (early bird)</span>
            <span className="font-semibold text-[#0c2340]">
              {setup.ticket_price_early_bird != null ? formatCurrency(setup.ticket_price_early_bird) : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-muted-text)]">Payment deadline</span>
            <span className="font-semibold text-[#0c2340]">{formatDate(setup.payment_deadline)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-muted-text)]">Cost categories</span>
            <span className="font-semibold text-[#0c2340]">{categoryCount}</span>
          </div>
        </div>
      )}
    </BentoCard>
  );
}

function GuestListCard({ eventId, onOpen }) {
  const { canRead } = useAccess("event.guests");
  const [guests, setGuests] = useState([]);
  const [tableCount, setTableCount] = useState(0);

  useEffect(() => {
    if (!canRead) return;
    listEventGuests(eventId).then(setGuests);
    listTableMapping(eventId).then((tables) => setTableCount(tables.length));
  }, [eventId, canRead]);

  const paid = guests.filter((g) => g.payment_status === "paid").length;
  const notPaid = guests.filter((g) => g.payment_status === "not_paid").length;

  return (
    <BentoCard icon={Users} title="Guest List" linkLabel="Manage" onLinkClick={onOpen} canRead={canRead}>
      <div className="flex gap-5">
        <StatPair value={paid} label="Confirmed" color="var(--color-brand-blue)" />
        <StatPair value={tableCount} label="Tables" />
        <StatPair value={notPaid} label="Pending RSVP" />
      </div>
    </BentoCard>
  );
}

function SponsorsCard({ eventId, onOpen }) {
  const { canRead } = useAccess("event.sponsors");
  const [sponsors, setSponsors] = useState([]);

  useEffect(() => {
    if (!canRead) return;
    listEventSponsors(eventId).then(setSponsors);
  }, [eventId, canRead]);

  const total = sponsors.reduce((sum, s) => sum + (s.total_cost || 0), 0);
  const byCategory = sponsors.reduce((acc, s) => {
    const key = s.category || "Uncategorised";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return (
    <BentoCard icon={Building2} title="Sponsors" linkLabel="Manage" onLinkClick={onOpen} canRead={canRead}>
      <div className="flex gap-5">
        <StatPair value={sponsors.length} label="Sponsors" color="var(--color-tone-lavender-text)" />
        <StatPair value={formatCurrency(total)} label="Raised" />
      </div>
      <div className="flex flex-wrap gap-[6px]">
        {Object.entries(byCategory).map(([category, count]) => (
          <span
            key={category}
            className="rounded-full bg-[var(--tone-lavender-bg)] px-[10px] py-1 text-[11px] font-semibold text-[var(--color-tone-lavender-text)]"
          >
            {category} ×{count}
          </span>
        ))}
      </div>
    </BentoCard>
  );
}

function CostsCard({ eventId, onOpen }) {
  const { canRead } = useAccess("event.costs");
  const [costs, setCosts] = useState([]);

  useEffect(() => {
    if (!canRead) return;
    listEventCosts(eventId).then(setCosts);
  }, [eventId, canRead]);

  const byCategory = costs.reduce((acc, c) => {
    const key = c.category || "Uncategorised";
    acc[key] = (acc[key] || 0) + (c.total_cost || 0);
    return acc;
  }, {});
  const topCategories = Object.entries(byCategory).slice(0, 3);

  return (
    <BentoCard icon={Wallet} title="Operational Cost" linkLabel="Manage" onLinkClick={onOpen} canRead={canRead}>
      <div className="flex flex-col gap-2 text-[13px]">
        {topCategories.length === 0 ? (
          <span className="text-[var(--color-muted-text)]">No costs yet.</span>
        ) : (
          topCategories.map(([category, total]) => (
            <div key={category} className="flex justify-between">
              <span className="text-[var(--color-muted-text)]">{category}</span>
              <span className="font-semibold text-[#0c2340]">{formatCurrency(total)}</span>
            </div>
          ))
        )}
      </div>
    </BentoCard>
  );
}

function LuckyDrawCard({ eventId, onOpen }) {
  const { canRead } = useAccess("event.auction");
  const [items, setItems] = useState([]);
  const [config, setConfig] = useState(null);

  useEffect(() => {
    if (!canRead) return;
    Promise.all([listEventItems(eventId), getLuckyDrawConfig(eventId)]).then(
      ([itemsData, configData]) => {
        setItems(itemsData);
        setConfig(configData);
      },
    );
  }, [eventId, canRead]);

  return (
    <BentoCard icon={Ticket} title="Lucky Draw & Auction" linkLabel="Manage" onLinkClick={onOpen} canRead={canRead}>
      <div className="flex gap-5">
        <StatPair
          value={config?.tickets_sold ?? 0}
          label="Tickets sold"
          color="var(--color-tone-amber-text)"
        />
        <StatPair value={items.length} label="Prize items" />
      </div>
    </BentoCard>
  );
}

function RundownCard({ eventId, onOpen }) {
  const { canRead } = useAccess("event.rundown");
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!canRead) return;
    listEventRundown(eventId).then(setRows);
  }, [eventId, canRead]);

  return (
    <BentoCard
      icon={ListChecks}
      title="Rundown"
      linkLabel="Manage"
      onLinkClick={onOpen}
      canRead={canRead}
      className="md:col-span-2"
    >
      {rows.length === 0 ? (
        <p className="text-[13px] text-[var(--color-muted-text)]">No rundown rows yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.slice(0, 4).map((row) => (
            <div key={row.id} className="flex items-center gap-3 text-[13px]">
              <span className="w-14 font-semibold text-[var(--color-muted-text)]">{row.time}</span>
              <span className="flex-1 text-[#0c2340]">{row.activity}</span>
            </div>
          ))}
        </div>
      )}
    </BentoCard>
  );
}

// Story 14.13: 7-card bento overview for the Manage Project page. 3 stacked
// Tailwind grid containers (rather than one mega-grid with named lines)
// since the mockup's row ratios differ per row: 2fr/1fr, then 3 equal
// columns, then Rundown spanning both columns of a 2-col row.
export default function EventManageBento({ eventId, onOpenPanel }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4">
        <SummaryCard eventId={eventId} onOpen={() => onOpenPanel("summary")} />
        <SetupCard eventId={eventId} onOpen={() => onOpenPanel("setup")} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GuestListCard eventId={eventId} onOpen={() => onOpenPanel("guests")} />
        <SponsorsCard eventId={eventId} onOpen={() => onOpenPanel("sponsors")} />
        <CostsCard eventId={eventId} onOpen={() => onOpenPanel("costs")} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <LuckyDrawCard eventId={eventId} onOpen={() => onOpenPanel("lucky")} />
        <RundownCard eventId={eventId} onOpen={() => onOpenPanel("rundown")} />
      </div>
    </div>
  );
}
