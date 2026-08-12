import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  FileDown,
  Filter,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { getEventSetup } from "../api/eventSetup";
import {
  deleteEventItem,
  downloadAuctionReceiptsReport,
  downloadLuckyDrawResultsReport,
  downloadProgrammeReport,
  getLuckyDrawConfig,
  listEventItems,
  saveLuckyDrawConfig,
  updateEventItem,
} from "../api/eventItems";
import { listMembers } from "../api/members";
import { useAccess } from "../hooks/useAccess";
import { formatCurrency } from "../utils/formatters";
import EventItemFormModal from "../components/EventItemFormModal";
import MultiSelectDropdown from "../components/MultiSelectDropdown";
import Card from "../components/Card";

const TYPE_LABEL = {
  auction: "Auction",
  lucky_draw_on_stage: "Lucky Draw On Stage",
  lucky_draw: "Lucky Draw",
};

// 2026-08-08: click-to-cycle Type through the 3 item types (same pill
// design as Payment Status/Early Bird elsewhere — rounded-full pill, own
// color set). Each of the 3 values now gets its own distinct tone (was
// 2 colors for 3 values — lucky_draw_on_stage/lucky_draw both blue — so a
// click didn't always look like it changed anything).
const TYPE_CYCLE = {
  auction: "lucky_draw_on_stage",
  lucky_draw_on_stage: "lucky_draw",
  lucky_draw: "auction",
};

const TYPE_CHIP = {
  auction: { bg: "var(--gold-soft)", color: "var(--gold-ink)" },
  lucky_draw_on_stage: { bg: "var(--accent-soft)", color: "var(--accent-ink)" },
  lucky_draw: { bg: "var(--ok-bg)", color: "var(--ok)" },
};

const STATUS_LABEL = { received: "Received", not_received: "Not Received" };

// 2026-08-08: click-to-cycle Status (2-way) — own color set, distinct from
// Type above and Ad Page below.
const STATUS_CYCLE = { received: "not_received", not_received: "received" };
const STATUS_CHIP = {
  received: { bg: "var(--ok-bg)", color: "var(--ok)" },
  not_received: { bg: "var(--low-bg)", color: "var(--low)" },
};

// 2026-08-08: click-to-toggle Ad Page (Yes/No) — own color set, distinct
// from Type/Status above.
const AD_PAGE_CHIP = {
  yes: { bg: "var(--warn-bg)", color: "var(--warn)" },
  no: { bg: "var(--bg-alt)", color: "var(--muted)" },
};

// Shared pill look for all three click-to-change columns above — "same
// look, different set of colors" per explicit request.
function ToggleChip({ label, tone, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-fit rounded-full px-[10px] py-[3px] text-[11px] font-bold disabled:cursor-wait disabled:opacity-60"
      style={{ background: tone.bg, color: tone.color }}
    >
      {label}
    </button>
  );
}

// 2026-08-10, reworked twice more on 2026-08-11 (see
// app/api/event_item.py's _ITEM_PREFIX/_GROUP_KEY): the printed letter
// always matches the item's own type — auction "A", on-stage "LS", regular
// "L" — but the NUMBER after it is drawn from one shared pool for the two
// lucky-draw subtypes (on-stage items filling the front of the pool, so an
// on-stage block of 3 followed by 2 regular items reads LS-1, LS-2, LS-3,
// L-4, L-5 — the regular block continues the count rather than resetting).
// The bubble is also colored per-Type via `tone` below (auction
// lavender/gold, on-stage blue/accent, regular teal/ok).
const LOT_REF_PREFIX = { auction: "A", lucky_draw_on_stage: "LS", lucky_draw: "L" };

function lotRefNumberPart(item) {
  if (!item.lot_ref) return "";
  const prefix = LOT_REF_PREFIX[item.item_type];
  return item.lot_ref.startsWith(`${prefix}-`) ? item.lot_ref.slice(prefix.length + 1) : item.lot_ref;
}

// 2026-08-10: number is type-in (the only editable part) — default value
// is value_hkd-descending position within the item's own type sequence,
// but any value can be typed to force a specific position (the backend
// inserts the item there and shifts the rest of the sequence, see
// backend/app/api/event_item.py's _insert_and_shift). The list itself
// always displays in current lot-number order, whether that's the
// untouched default or after a manual change (see _sorted_items) — so
// re-typing a number here also moves the row. A manually-set number is
// marked with a small dot; that mark (and the position itself) clears the
// next time anything in the sequence recalculates — a value_hkd change,
// an item_type move, or a new item being added.
function LotRefField({ item, tone, onBlurValue, error }) {
  const prefix = LOT_REF_PREFIX[item.item_type];
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1">
        <span
          className="flex h-6 min-w-[22px] shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold"
          style={{ background: tone.bg, color: tone.color }}
        >
          {prefix}
        </span>
        <input
          // 2026-08-10 fix: uncontrolled input (defaultValue) only applies
          // on mount — without a key tied to the actual value, changing
          // *another* item's Type/value could renumber this item's
          // lot_ref server-side (see _recompute_group), the refetch would
          // update `item.lot_ref`, but this same DOM node would keep
          // showing its old number since React never re-applies
          // defaultValue after mount. Keying on the current lot_ref forces
          // a fresh node (and fresh defaultValue) whenever it changes for
          // any reason, not just this field's own edits.
          key={item.lot_ref}
          type="number"
          min={1}
          defaultValue={lotRefNumberPart(item)}
          onBlur={(event) => {
            const raw = event.target.value.trim();
            onBlurValue(raw === "" ? "" : `${prefix}-${raw}`);
          }}
          aria-label={`Lot number for ${item.name}`}
          className={`w-12 rounded-md border px-1.5 py-1 text-xs ${
            error ? "border-[var(--color-tone-rose-text)]" : "border-[var(--color-card-border)]"
          }`}
        />
        {item.lot_ref_overridden && (
          <span
            className="h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--color-tone-amber-text)]"
            title="Manually overridden — resets to value order on the next recalculation"
            aria-label="Manually overridden"
          />
        )}
      </div>
      {error && <span className="max-w-[140px] text-[10px] leading-tight text-[var(--color-tone-rose-text)]">{error}</span>}
    </div>
  );
}

const TILE_TONES = [
  { bg: "var(--gold-soft)", color: "var(--gold-ink)" },
  { bg: "var(--accent-soft)", color: "var(--accent-ink)" },
  { bg: "var(--ok-bg)", color: "var(--ok)" },
  { bg: "var(--low-bg)", color: "var(--low)" },
  { bg: "var(--warn-bg)", color: "var(--warn)" },
];

const SORTABLE_COLUMNS = [
  { key: "lot_ref", label: "Lot Ref" },
  { key: "name", label: "Name" },
  { key: "value_hkd", label: "Value HKD" },
  { key: "donor_sponsor", label: "Donor / Sponsor" },
  { key: "contact_rotary_name", label: "Contact Rotary" },
  { key: "item_type", label: "Type" },
  { key: "ad_page", label: "Ad Page" },
  { key: "status", label: "Status" },
  { key: "value_sold", label: "Value Sold" },
];

function itemSortValue(item, key) {
  switch (key) {
    case "item_type":
      return TYPE_LABEL[item.item_type] || "";
    case "status":
      return STATUS_LABEL[item.status] || "";
    case "ad_page":
      return item.ad_page ? 1 : 0;
    case "value_hkd":
    case "value_sold":
      return item[key] ?? -1;
    case "lot_ref": {
      // "A-2"/"L-19"/"L-345" compared as plain strings sort "L-19" before
      // "L-2" (lexicographic, digit by digit) — zero-pad the numeric part
      // so the string comparison below still lines up with numeric order.
      if (!item.lot_ref) return "";
      const match = item.lot_ref.match(/^(.*)-(\d+)$/);
      if (!match) return item.lot_ref;
      const [, prefix, num] = match;
      return `${prefix}-${num.padStart(6, "0")}`;
    }
    default:
      return item[key] || "";
  }
}

function StatTile({ value, label }) {
  return (
    <Card variant="stat-blue" className="flex flex-col">
      <span className="text-3xl font-bold">{value}</span>
      <span className="mt-2 text-sm">{label}</span>
    </Card>
  );
}

export default function EventLuckyDraw({ event: selectedEvent }) {
  const { canRead, canWrite } = useAccess("event.auction");

  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [items, setItems] = useState([]);
  const [config, setConfig] = useState({ tickets_sold: 0, other_donation: 0 });
  const [setup, setSetup] = useState(null);
  const [isLoadingItemData, setIsLoadingItemData] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const [generatingReport, setGeneratingReport] = useState(null);
  const [reportErrors, setReportErrors] = useState({});
  const [lotRefErrors, setLotRefErrors] = useState({});
  // 2026-08-10: guards against rapid double-clicks on Type/Status/Ad Page
  // firing two overlapping PATCH requests for the same item — each one
  // recomputes lot_ref sequences server-side from whatever the DB looks
  // like at that instant, so two in-flight requests for the same item can
  // race and leave a stale/gapped result. One in-flight mutation per item
  // at a time; the chip disables itself while its own request is pending.
  const [pendingItemIds, setPendingItemIds] = useState(() => new Set());

  const [typeFilters, setTypeFilters] = useState([]);
  const [statusFilters, setStatusFilters] = useState([]);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function toggleFilter(setFilters, value) {
    setFilters((current) =>
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    );
  }

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    listMembers({ status: "active" })
      .then(setMembers)
      .catch((err) => setLoadError(err.detail || "Failed to load members"))
      .finally(() => setIsLoading(false));
  }, [canRead]);

  async function loadItemData({ silent = false } = {}) {
    if (!selectedEvent) return;
    // 2026-08-08: silent skips the loading flip so row-level toggles
    // (Type/Ad Page/Status) don't unmount the whole table and jump the
    // page back to top — same fix as EventGuestList.jsx's loadGuestData.
    if (!silent) setIsLoadingItemData(true);
    const [itemsData, configData, setupData] = await Promise.all([
      listEventItems(selectedEvent.id),
      getLuckyDrawConfig(selectedEvent.id),
      getEventSetup(selectedEvent.id),
    ]);
    setItems(itemsData);
    setConfig(configData);
    setSetup(setupData);
    if (!silent) setIsLoadingItemData(false);
  }

  useEffect(() => {
    loadItemData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvent]);

  const summary = useMemo(() => {
    const ticketsSold = config.tickets_sold || 0;
    const luckyDrawAmount = ticketsSold * (setup?.lucky_draw_ticket_price || 0);
    const auctionAmount = items
      .filter((i) => i.item_type === "auction")
      .reduce((sum, i) => sum + (i.value_sold || 0), 0);
    const otherDonation = config.other_donation || 0;
    const totalDonations = luckyDrawAmount + auctionAmount + otherDonation;

    return {
      ticketsSold,
      luckyDrawAmount,
      auctionAmount,
      otherDonation,
      totalDonations,
      prizePool: luckyDrawAmount + otherDonation,
      totalGifts: items.length,
      auctionCount: items.filter((i) => i.item_type === "auction").length,
      onStageCount: items.filter((i) => i.item_type === "lucky_draw_on_stage").length,
      luckyDrawCount: items.filter((i) => i.item_type === "lucky_draw").length,
    };
  }, [items, config, setup]);

  const visibleItems = useMemo(() => {
    let rows = items;
    if (typeFilters.length > 0) {
      rows = rows.filter((item) => typeFilters.includes(item.item_type));
    }
    if (statusFilters.length > 0) {
      rows = rows.filter((item) => statusFilters.includes(item.status));
    }
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const av = itemSortValue(a, sortKey);
        const bv = itemSortValue(b, sortKey);
        const cmp =
          typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [items, typeFilters, statusFilters, sortKey, sortDir]);

  async function handleSaveConfig(e) {
    e.preventDefault();
    setIsSavingConfig(true);
    try {
      const saved = await saveLuckyDrawConfig(selectedEvent.id, {
        tickets_sold: Number(config.tickets_sold) || 0,
        other_donation: Number(config.other_donation) || 0,
      });
      setConfig(saved);
    } finally {
      setIsSavingConfig(false);
    }
  }

  function openCreate() {
    setEditingItem(null);
    setIsFormOpen(true);
  }

  function openEdit(item) {
    setEditingItem(item);
    setIsFormOpen(true);
  }

  function handleSaved() {
    setIsFormOpen(false);
    setEditingItem(null);
    loadItemData();
  }

  async function handleDelete(item) {
    if (!window.confirm(`Delete item ${item.lot_ref} — ${item.name}?`)) return;
    await deleteEventItem(selectedEvent.id, item.id);
    loadItemData();
  }

  // 2026-08-10: serializes mutations per item — if a request for this item
  // is already in flight, ignore the click instead of firing a second,
  // racing PATCH. Also guards the tail end (marking not-pending) even if
  // the request throws.
  async function withItemPending(item, action) {
    if (pendingItemIds.has(item.id)) return;
    setPendingItemIds((current) => new Set(current).add(item.id));
    try {
      await action();
    } finally {
      setPendingItemIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  // 2026-08-08: click-to-cycle Type/Status, click-to-toggle Ad Page — same
  // pattern as PaymentChip/EarlyBirdChip elsewhere in the Event module.
  function handleCycleType(item) {
    return withItemPending(item, async () => {
      await updateEventItem(selectedEvent.id, item.id, { item_type: TYPE_CYCLE[item.item_type] });
      await loadItemData({ silent: true });
    });
  }

  function handleToggleAdPage(item) {
    return withItemPending(item, async () => {
      await updateEventItem(selectedEvent.id, item.id, { ad_page: !item.ad_page });
      await loadItemData({ silent: true });
    });
  }

  function handleCycleStatus(item) {
    return withItemPending(item, async () => {
      await updateEventItem(selectedEvent.id, item.id, { status: STATUS_CYCLE[item.status] });
      await loadItemData({ silent: true });
    });
  }

  // 2026-08-08: manual Lot Ref override — the backend validates the
  // "<prefix>-<n>" format against the item's own type-group and performs
  // the insert-and-shift; a rejected value (wrong prefix, not a number,
  // etc.) shows inline instead of being applied.
  async function handleLotRefBlur(item, rawValue) {
    const trimmed = rawValue.trim();
    if (trimmed === "" || trimmed === item.lot_ref) {
      setLotRefErrors((current) => ({ ...current, [item.id]: null }));
      return;
    }
    try {
      await updateEventItem(selectedEvent.id, item.id, { lot_ref: trimmed });
      setLotRefErrors((current) => ({ ...current, [item.id]: null }));
      loadItemData({ silent: true });
    } catch (err) {
      setLotRefErrors((current) => ({ ...current, [item.id]: err.detail || "Invalid lot ref" }));
    }
  }

  async function handleDownloadReport(downloadFn, reportKey) {
    setReportErrors((current) => ({ ...current, [reportKey]: null }));
    setGeneratingReport(reportKey);
    try {
      const { blob, filename } = await downloadFn(selectedEvent.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setReportErrors((current) => ({
        ...current,
        [reportKey]: err.detail || "Failed to generate report",
      }));
    } finally {
      setGeneratingReport(null);
    }
  }

  if (!canRead) {
    return (
      <div className="admin-page event-lucky-draw-page">
        <h1>Lucky Draw &amp; Auction</h1>
        <p role="alert">You do not have permission to view Lucky Draw &amp; Auction.</p>
      </div>
    );
  }

  const reportButtonClass =
    "inline-flex h-[38px] items-center gap-[7px] rounded-[8px] border border-[var(--border)] bg-transparent px-[15px] text-[13.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--bg-alt)] disabled:opacity-50";

  return (
    <div className="admin-page admin-page-wide event-lucky-draw-page">
      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && (
        <>
          {selectedEvent && isLoadingItemData && <p>Loading item data…</p>}

          {selectedEvent && !isLoadingItemData && (
            <>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-[18px_22px]">
                <form onSubmit={handleSaveConfig} className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="lucky-draw-tickets-sold"
                      className="pl-0.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]"
                    >
                      Tickets sold
                    </label>
                    <input
                      id="lucky-draw-tickets-sold"
                      type="number"
                      value={config.tickets_sold}
                      onChange={(e) => setConfig({ ...config, tickets_sold: e.target.value })}
                      disabled={!canWrite}
                      className="h-[38px] w-[100px] rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13.5px] text-[var(--ink)]"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="lucky-draw-other-donation"
                      className="pl-0.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]"
                    >
                      Other donation (HKD)
                    </label>
                    <input
                      id="lucky-draw-other-donation"
                      type="number"
                      step="0.01"
                      value={config.other_donation}
                      onChange={(e) => setConfig({ ...config, other_donation: e.target.value })}
                      disabled={!canWrite}
                      className="h-[38px] w-[130px] rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13.5px] text-[var(--ink)]"
                    />
                  </div>
                  {canWrite && (
                    <button
                      type="submit"
                      disabled={isSavingConfig}
                      className="inline-flex h-[38px] items-center rounded-[8px] bg-[var(--accent)] px-[15px] text-[13.5px] font-semibold text-white hover:bg-[var(--accent-ink)] disabled:opacity-50"
                    >
                      {isSavingConfig ? "Saving…" : "Save"}
                    </button>
                  )}
                </form>
                <div className="text-right">
                  <span className="block text-[20px] font-bold text-[var(--gold-ink)]">
                    {formatCurrency(summary.prizePool)}
                  </span>
                  <span className="text-[12px] text-[var(--faint)]">Prize pool</span>
                </div>
              </div>

              <div className="mb-4 flex items-end justify-between flex-wrap gap-3">
                <div className="flex flex-wrap items-end gap-3">
                  <button
                    type="button"
                    onClick={() => handleDownloadReport(downloadProgrammeReport, "programme")}
                    disabled={generatingReport === "programme"}
                    className={reportButtonClass}
                  >
                    <FileDown className="w-[15px] h-[15px]" aria-hidden="true" />
                    {generatingReport === "programme" ? "Generating…" : "Programme List"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadReport(downloadLuckyDrawResultsReport, "results")}
                    disabled={generatingReport === "results"}
                    className={reportButtonClass}
                  >
                    <FileDown className="w-[15px] h-[15px]" aria-hidden="true" />
                    {generatingReport === "results" ? "Generating…" : "Lucky Draw Results"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadReport(downloadAuctionReceiptsReport, "auction-receipts")}
                    disabled={generatingReport === "auction-receipts"}
                    className={reportButtonClass}
                  >
                    <FileDown className="w-[15px] h-[15px]" aria-hidden="true" />
                    {generatingReport === "auction-receipts" ? "Generating…" : "Auction Receipts"}
                  </button>
                  <MultiSelectDropdown
                    icon={Filter}
                    ariaLabel="Type"
                    allLabel="All types"
                    options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))}
                    selected={typeFilters}
                    onToggleOption={(value) => toggleFilter(setTypeFilters, value)}
                    onClear={() => setTypeFilters([])}
                  />
                  <MultiSelectDropdown
                    icon={Filter}
                    ariaLabel="Status"
                    allLabel="All statuses"
                    options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))}
                    selected={statusFilters}
                    onToggleOption={(value) => toggleFilter(setStatusFilters, value)}
                    onClear={() => setStatusFilters([])}
                  />
                </div>
                {canWrite && selectedEvent && (
                  <button
                    type="button"
                    onClick={openCreate}
                    className="inline-flex h-[38px] items-center gap-[7px] rounded-[8px] bg-[var(--accent)] px-[15px] text-[13.5px] font-semibold text-white hover:bg-[var(--accent-ink)]"
                  >
                    <Plus className="w-[15px] h-[15px]" aria-hidden="true" />
                    Add Item
                  </button>
                )}
              </div>
              {reportErrors.programme && <p role="alert">{reportErrors.programme}</p>}
              {reportErrors.results && <p role="alert">{reportErrors.results}</p>}
              {reportErrors["auction-receipts"] && (
                <p role="alert">{reportErrors["auction-receipts"]}</p>
              )}

              {/* 2026-08-08: grid instead of flex-wrap — flex-wrap sized
                  each card to its own text (e.g. "HKD 5,500" vs "100"),
                  so cards were visibly different widths. A fixed-column
                  grid gives every card the same size regardless of value
                  length, same as every other stat-card row in the app. */}
              <div className="mb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 stat-duo-grid">
                {[
                  { value: summary.ticketsSold, label: "Tickets Sold" },
                  { value: formatCurrency(summary.luckyDrawAmount), label: "Lucky Draw Amount" },
                  { value: formatCurrency(summary.auctionAmount), label: "Auction Amount" },
                  { value: formatCurrency(summary.otherDonation), label: "Other Donation" },
                  { value: formatCurrency(summary.totalDonations), label: "Total Donations" },
                ].map(({ value, label }, index) => {
                  const tone = TILE_TONES[index % 5];
                  return <StatTile key={label} bg={tone.bg} color={tone.color} value={value} label={label} />;
                })}
              </div>

              <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3 stat-duo-grid">
                {[
                  { value: summary.totalGifts, label: "Total Gifts" },
                  { value: summary.auctionCount, label: "Auction" },
                  { value: summary.onStageCount, label: "Lucky Draw On Stage" },
                  { value: summary.luckyDrawCount, label: "Lucky Draw" },
                ].map(({ value, label }, index) => {
                  const tone = TILE_TONES[(index + 1) % 5];
                  return <StatTile key={label} bg={tone.bg} color={tone.color} value={value} label={label} />;
                })}
              </div>

              {items.length === 0 ? (
                <p className="member-empty-state">No items added for this event yet.</p>
              ) : visibleItems.length === 0 ? (
                <p className="member-empty-state">No items match the selected filters.</p>
              ) : (
                <div className="overflow-hidden">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-[var(--color-border-faint)]">
                        {SORTABLE_COLUMNS.map(({ key, label }) => (
                          <th
                            key={key}
                            className="px-4 py-3 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]"
                          >
                            <button
                              type="button"
                              onClick={() => toggleSort(key)}
                              className="inline-flex items-center gap-1 bg-transparent p-0 uppercase tracking-[0.03em] text-inherit"
                            >
                              {label}
                              {sortKey === key ? (
                                sortDir === "asc" ? (
                                  <ChevronUp className="w-3 h-3" aria-hidden="true" />
                                ) : (
                                  <ChevronDown className="w-3 h-3" aria-hidden="true" />
                                )
                              ) : (
                                <ChevronsUpDown className="w-3 h-3 opacity-40" aria-hidden="true" />
                              )}
                            </button>
                          </th>
                        ))}
                        <th className="px-4 py-3 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleItems.map((item) => {
                        const chip = TYPE_CHIP[item.item_type];
                        return (
                          <tr
                            key={item.id}
                            className="border-b border-[var(--color-border-light)] text-[13px] text-[var(--text-h)] last:border-b-0"
                          >
                            <td className="px-4 py-[13px]">
                              <LotRefField
                                item={item}
                                tone={chip}
                                onBlurValue={(value) => handleLotRefBlur(item, value)}
                                error={lotRefErrors[item.id]}
                              />
                            </td>
                            <td className="px-4 py-[13px] font-semibold">{item.name}</td>
                            <td className="px-4 py-[13px]">
                              {item.value_hkd != null ? formatCurrency(item.value_hkd) : "—"}
                            </td>
                            <td className="px-4 py-[13px] text-[var(--color-muted-text)]">
                              {item.donor_sponsor || "—"}
                            </td>
                            <td className="px-4 py-[13px] text-[var(--color-muted-text)]">
                              {item.contact_rotary_name || "—"}
                            </td>
                            <td className="px-4 py-[13px]">
                              <ToggleChip
                                label={TYPE_LABEL[item.item_type]}
                                tone={chip}
                                onClick={() => handleCycleType(item)}
                                disabled={pendingItemIds.has(item.id)}
                              />
                            </td>
                            <td className="px-4 py-[13px]">
                              <ToggleChip
                                label={item.ad_page ? "Yes" : "No"}
                                tone={AD_PAGE_CHIP[item.ad_page ? "yes" : "no"]}
                                onClick={() => handleToggleAdPage(item)}
                                disabled={pendingItemIds.has(item.id)}
                              />
                            </td>
                            <td className="px-4 py-[13px]">
                              <ToggleChip
                                label={STATUS_LABEL[item.status]}
                                tone={STATUS_CHIP[item.status]}
                                onClick={() => handleCycleStatus(item)}
                                disabled={pendingItemIds.has(item.id)}
                              />
                            </td>
                            <td className="px-4 py-[13px]">
                              {item.item_type === "auction" && item.value_sold != null
                                ? formatCurrency(item.value_sold)
                                : "—"}
                            </td>
                            <td className="px-4 py-[13px]">
                              {canWrite && (
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => openEdit(item)}
                                    title="Edit"
                                    className="event-iact"
                                  >
                                    <Pencil className="w-[14px] h-[14px]" aria-hidden="true" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(item)}
                                    title="Delete"
                                    className="event-iact event-iact-danger"
                                  >
                                    <Trash2 className="w-[14px] h-[14px]" aria-hidden="true" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      {isFormOpen && selectedEvent && (
        <EventItemFormModal
          eventId={selectedEvent.id}
          item={editingItem}
          members={members}
          onClose={() => setIsFormOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
