import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  FileDown,
  Filter,
  Pencil,
  Search,
  Trash2,
  UserPlus,
} from "lucide-react";
import { getEventSetup, listTableMapping } from "../api/eventSetup";
import {
  deleteEventGuest,
  downloadEventGuestListReport,
  listEventGuests,
  updateEventGuest,
} from "../api/eventGuests";
import { listMembers } from "../api/members";
import { useAccess } from "../hooks/useAccess";
import { formatCurrency } from "../utils/formatters";
import EventGuestFormModal from "../components/EventGuestFormModal";
import MultiSelectDropdown from "../components/MultiSelectDropdown";

const SORTABLE_COLUMNS = [
  { key: "title", label: "Title" },
  { key: "surname", label: "Surname" },
  { key: "first_name", label: "First Name" },
  { key: "contact_rotarian_name", label: "Contact Rotarian" },
  { key: "payment_status", label: "Payment Status" },
  { key: "early_bird", label: "Early Bird" },
  { key: "table_number", label: "Table Number" },
  { key: "theme_name", label: "Theme Name" },
  { key: "rotary_name", label: "Rotary Name" },
];

function guestSortValue(guest, key, tableByNumber) {
  const table = tableByNumber.get(guest.table_number);
  switch (key) {
    case "early_bird":
      return guest.early_bird ? 1 : 0;
    case "table_number":
      return guest.table_number ?? -1;
    case "theme_name":
      return table?.theme_name || "";
    case "rotary_name":
      return table?.rotary_name || "";
    default:
      return guest[key] || "";
  }
}

function StatCard({ bg, color, value, label }) {
  return (
    <div className="rounded-2xl p-[14px_18px]" style={{ background: bg }}>
      <span className="block text-[20px] font-bold" style={{ color }}>
        {value}
      </span>
      <span className="text-[12px] text-[var(--text)]">{label}</span>
    </div>
  );
}

const PAYMENT_STATUS_CYCLE = { paid: "not_paid", not_paid: "guest", guest: "paid" };

const PAYMENT_CHIP_STYLES_MINIMAL = {
  paid: "bg-[var(--ok-bg)] text-[var(--ok)]",
  not_paid: "bg-[var(--low-bg)] text-[var(--low)]",
  guest: "bg-[var(--accent-soft)] text-[var(--accent-ink)]",
};

const PAYMENT_CHIP_LABELS = { paid: "Paid", not_paid: "Not Paid", guest: "Invited" };

function PaymentChip({ status, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-fit rounded-full px-[10px] py-[3px] text-[11px] font-bold ${PAYMENT_CHIP_STYLES_MINIMAL[status]}`}
    >
      {PAYMENT_CHIP_LABELS[status]}
    </button>
  );
}

// 2026-08-06: Early Bird's own pill — same shape/size as PaymentChip above
// ("same design as payment status"), and now click-to-toggle the same way
// (Yes <-> No) instead of being a plain read-only label.
const EARLY_BIRD_CHIP_STYLES_MINIMAL = {
  yes: "bg-[var(--ok-bg)] text-[var(--ok)]",
  no: "bg-[var(--bg-alt)] text-[var(--muted)]",
};

function EarlyBirdChip({ earlyBird, onClick }) {
  const key = earlyBird ? "yes" : "no";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-fit rounded-full px-[10px] py-[3px] text-[11px] font-bold ${EARLY_BIRD_CHIP_STYLES_MINIMAL[key]}`}
    >
      {earlyBird ? "Yes" : "No"}
    </button>
  );
}

// 2026-08-06: Table Number/Theme Name/Rotary Name all share one color per
// table (cycled across the same 6-tone palette used elsewhere, e.g.
// Dashboard/MembersStatistics), so the three columns read as one visually
// grouped "Table" identity per explicit request — same chip style, a
// different color per distinct table.
const TABLE_TONES_MINIMAL = [
  { bg: "var(--accent-soft)", text: "var(--accent-ink)" },
  { bg: "var(--gold-soft)", text: "var(--gold-ink)" },
  { bg: "var(--ok-bg)", text: "var(--ok)" },
  { bg: "var(--warn-bg)", text: "var(--warn)" },
  { bg: "var(--low-bg)", text: "var(--low)" },
];

// Read-only display chip — used for Theme Name/Rotary Name (the table's own
// fields) and the per-table breakdown aside.
function TableChip({ children, tone, small }) {
  const className = `inline-block w-fit rounded-full font-bold ${
    small ? "px-[8px] py-[2px] text-[11px]" : "px-[10px] py-[3px] text-[11px] font-semibold"
  }`;
  if (!tone) return <span className="text-[var(--color-muted-text)]">{children}</span>;
  return (
    <span className={className} style={{ background: tone.bg, color: tone.text }}>
      {children}
    </span>
  );
}

// 2026-08-06: Table Number is edited by typing a new value, not by
// clicking to cycle (cycling was slow/awkward with more than a couple of
// tables, and refetched on every single click — see handleTableNumberBlur).
// Uncontrolled (defaultValue), validated on blur, same pattern as the
// amount-due/amount-paid inputs elsewhere in this app (e.g. MemberFees.jsx).
function TableNumberField({ guest, onBlurValue, error }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <input
        type="number"
        defaultValue={guest.table_number ?? ""}
        onBlur={(event) => onBlurValue(event.target.value)}
        aria-label={`Table number for ${guest.first_name} ${guest.surname}`}
        className={`w-14 rounded-md border px-1.5 py-1 text-center text-xs ${
          error ? "border-[var(--color-tone-rose-text)]" : "border-[var(--color-card-border)]"
        }`}
      />
      {error && <span className="max-w-[110px] text-[10px] leading-tight text-[var(--color-tone-rose-text)]">{error}</span>}
    </div>
  );
}

export default function EventGuestList({ event: selectedEvent }) {
  const { canRead, canWrite } = useAccess("event.guests");

  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [guests, setGuests] = useState([]);
  const [tableMapping, setTableMapping] = useState([]);
  const [setup, setSetup] = useState(null);
  const [isLoadingGuestData, setIsLoadingGuestData] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGuest, setEditingGuest] = useState(null);

  const [reportFormat, setReportFormat] = useState("pdf");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState(null);

  const [tableNumberErrors, setTableNumberErrors] = useState({});

  const [search, setSearch] = useState("");
  const [paymentFilters, setPaymentFilters] = useState([]);
  const [earlyBirdFilters, setEarlyBirdFilters] = useState([]);
  const [tableFilters, setTableFilters] = useState([]);
  const [contactRotarianFilters, setContactRotarianFilters] = useState([]);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

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

  async function loadGuestData({ silent = false } = {}) {
    // No early "not loading" reset here when selectedEvent is briefly null
    // (events fetched but useSelectedEvent hasn't picked a default yet) —
    // that would flip isLoadingGuestData false-then-true-then-false again,
    // a flash the summary cards would render zeros during.
    if (!selectedEvent) return;
    // 2026-08-06: `silent` skips the isLoadingGuestData flip — flipping it
    // unmounts the whole summary+table block in favor of a single "Loading
    // guest data…" line, which collapses the page height and forces the
    // browser to scroll back to top. Row-level edits (payment/early bird/
    // table number) use silent so the page stays put at the edited row;
    // the initial load on mount/event-switch still shows the loading state.
    if (!silent) setIsLoadingGuestData(true);
    const [guestsData, tableData, setupData] = await Promise.all([
      listEventGuests(selectedEvent.id),
      listTableMapping(selectedEvent.id),
      getEventSetup(selectedEvent.id),
    ]);
    setGuests(guestsData);
    setTableMapping(tableData);
    setSetup(setupData);
    if (!silent) setIsLoadingGuestData(false);
  }

  useEffect(() => {
    loadGuestData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvent]);

  const tableByNumber = useMemo(() => {
    const map = new Map();
    tableMapping.forEach((table) => map.set(table.table_number, table));
    return map;
  }, [tableMapping]);

  // 2026-08-06: stable color index per distinct table number (assigned in
  // table-number order so it doesn't reshuffle as guests load/filter) —
  // used by TableChip so Table Number/Theme Name/Rotary Name all get the
  // same color per table.
  const tableColorIndexByNumber = useMemo(() => {
    const map = new Map();
    [...tableMapping]
      .sort((a, b) => a.table_number - b.table_number)
      .forEach((table, index) => map.set(table.table_number, index));
    return map;
  }, [tableMapping]);

  function tableToneFor(tableNumber) {
    if (tableNumber == null || !tableColorIndexByNumber.has(tableNumber)) return null;
    return TABLE_TONES_MINIMAL[tableColorIndexByNumber.get(tableNumber) % TABLE_TONES_MINIMAL.length];
  }

  const summary = useMemo(() => {
    const registered = guests.length;
    const paid = guests.filter((g) => g.payment_status === "paid").length;
    const invitedGuests = guests.filter((g) => g.payment_status === "guest").length;
    const totalAmount = guests
      .filter((g) => g.payment_status !== "guest")
      .reduce((sum, guest) => {
        const price = guest.early_bird
          ? setup?.ticket_price_early_bird
          : setup?.ticket_price_normal;
        return sum + (price || 0);
      }, 0);
    return { registered, paid, invitedGuests, totalAmount };
  }, [guests, setup]);

  // 2026-08-06: per-table breakdown shown below the summary cards — guest
  // count + paid/guest/pending split for each table, so an admin can see
  // at a glance which tables still have outstanding payments.
  const tableBreakdown = useMemo(() => {
    const byTable = new Map();
    guests.forEach((guest) => {
      const key = guest.table_number ?? null;
      if (!byTable.has(key)) {
        byTable.set(key, { tableNumber: key, total: 0, paid: 0, guestCount: 0, pending: 0 });
      }
      const row = byTable.get(key);
      row.total += 1;
      if (guest.payment_status === "paid") row.paid += 1;
      else if (guest.payment_status === "guest") row.guestCount += 1;
      else row.pending += 1;
    });
    return [...byTable.values()].sort((a, b) => (a.tableNumber ?? -1) - (b.tableNumber ?? -1));
  }, [guests]);

  // 2026-08-06: same breakdown, grouped by Contact Rotarian instead of
  // table — sits next to the per-table one.
  const contactRotarianBreakdown = useMemo(() => {
    const byContact = new Map();
    guests.forEach((guest) => {
      const key = guest.contact_rotarian_name || "";
      if (!byContact.has(key)) {
        byContact.set(key, { contactRotarianName: key, total: 0, paid: 0, guestCount: 0, pending: 0 });
      }
      const row = byContact.get(key);
      row.total += 1;
      if (guest.payment_status === "paid") row.paid += 1;
      else if (guest.payment_status === "guest") row.guestCount += 1;
      else row.pending += 1;
    });
    return [...byContact.values()].sort((a, b) => a.contactRotarianName.localeCompare(b.contactRotarianName));
  }, [guests]);

  const tableNumberOptions = useMemo(
    () =>
      [...tableMapping]
        .sort((a, b) => a.table_number - b.table_number)
        .map((table) => ({
          value: String(table.table_number),
          label: table.theme_name
            ? `Table ${table.table_number} — ${table.theme_name}`
            : `Table ${table.table_number}`,
        })),
    [tableMapping],
  );

  // 2026-08-06: used to click-to-cycle a guest's Table Number, same
  // interaction as PaymentChip/EarlyBirdChip.
  const sortedTableNumbers = useMemo(
    () => [...tableMapping].sort((a, b) => a.table_number - b.table_number).map((t) => t.table_number),
    [tableMapping],
  );

  const contactRotarianOptions = useMemo(
    () =>
      [...new Set(guests.map((guest) => guest.contact_rotarian_name).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [guests],
  );

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const visibleGuests = useMemo(() => {
    const term = search.trim().toLowerCase();
    let rows = guests.filter((guest) => {
      const table = tableByNumber.get(guest.table_number);
      if (term) {
        const haystack = [
          guest.title,
          guest.surname,
          guest.first_name,
          guest.contact_rotarian_name,
          table?.theme_name,
          table?.rotary_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (paymentFilters.length > 0 && !paymentFilters.includes(guest.payment_status)) return false;
      if (earlyBirdFilters.length > 0 && !earlyBirdFilters.includes(guest.early_bird ? "yes" : "no"))
        return false;
      if (tableFilters.length > 0 && !tableFilters.includes(String(guest.table_number ?? ""))) return false;
      if (
        contactRotarianFilters.length > 0 &&
        !contactRotarianFilters.includes(guest.contact_rotarian_name || "")
      )
        return false;
      return true;
    });
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const av = guestSortValue(a, sortKey, tableByNumber);
        const bv = guestSortValue(b, sortKey, tableByNumber);
        const cmp =
          typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [
    guests,
    tableByNumber,
    search,
    paymentFilters,
    earlyBirdFilters,
    tableFilters,
    contactRotarianFilters,
    sortKey,
    sortDir,
  ]);

  function openCreate() {
    setEditingGuest(null);
    setIsFormOpen(true);
  }

  function openEdit(guest) {
    setEditingGuest(guest);
    setIsFormOpen(true);
  }

  function handleSaved() {
    setIsFormOpen(false);
    setEditingGuest(null);
    loadGuestData();
  }

  async function handleTogglePaid(guest) {
    await updateEventGuest(selectedEvent.id, guest.id, {
      payment_status: PAYMENT_STATUS_CYCLE[guest.payment_status],
    });
    loadGuestData({ silent: true });
  }

  // 2026-08-06: click-to-toggle Early Bird, same pattern as
  // handleTogglePaid above.
  async function handleToggleEarlyBird(guest) {
    await updateEventGuest(selectedEvent.id, guest.id, { early_bird: !guest.early_bird });
    loadGuestData({ silent: true });
  }

  // 2026-08-06: Table Number is a type-in field, not click-to-cycle
  // (cycling was awkward with more than a couple of tables — every click
  // refetched and jumped the page too, per user feedback). Validated
  // against the event's actual configured table numbers on blur; invalid
  // entries show an inline error and are never sent to the API.
  async function handleTableNumberBlur(guest, rawValue) {
    const trimmed = rawValue.trim();
    if (trimmed === "" || Number(trimmed) === guest.table_number) {
      setTableNumberErrors((current) => ({ ...current, [guest.id]: null }));
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || !sortedTableNumbers.includes(parsed)) {
      setTableNumberErrors((current) => ({
        ...current,
        [guest.id]: `Not a table at this event (valid: ${sortedTableNumbers.join(", ") || "none configured"})`,
      }));
      return;
    }
    setTableNumberErrors((current) => ({ ...current, [guest.id]: null }));
    await updateEventGuest(selectedEvent.id, guest.id, { table_number: parsed });
    loadGuestData({ silent: true });
  }

  async function handleDelete(guest) {
    const confirmed = window.confirm(`Delete guest ${guest.first_name} ${guest.surname}?`);
    if (!confirmed) return;
    await deleteEventGuest(selectedEvent.id, guest.id);
    loadGuestData();
  }

  async function handleGenerateReport() {
    setIsGeneratingReport(true);
    setReportError(null);
    try {
      const { blob, filename } = await downloadEventGuestListReport(selectedEvent.id, reportFormat);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setReportError(err.detail || "Failed to generate report");
    } finally {
      setIsGeneratingReport(false);
    }
  }

  if (!canRead) {
    return (
      <div className="admin-page event-guest-list-page">
        <h1>Guest List</h1>
        <p role="alert">You do not have permission to view the Guest List.</p>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page-wide event-guest-list-page">
      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && (
        <>
          {selectedEvent && isLoadingGuestData && <p>Loading guest data…</p>}

          {selectedEvent && !isLoadingGuestData && (
            <>
              <div className="mb-4 flex items-end justify-between gap-3">
                <div className="flex items-end gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="guest-report-format"
                      className="pl-0.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]"
                    >
                      Format
                    </label>
                    <select
                      id="guest-report-format"
                      value={reportFormat}
                      onChange={(e) => setReportFormat(e.target.value)}
                      disabled={isGeneratingReport}
                      className="h-[38px] rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13.5px] text-[var(--ink)]"
                    >
                      <option value="pdf">PDF</option>
                      <option value="csv">CSV</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateReport}
                    disabled={isGeneratingReport}
                    className="inline-flex h-[38px] items-center gap-[7px] rounded-[8px] border border-[var(--border)] bg-transparent px-[15px] text-[13.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--bg-alt)]"
                  >
                    <FileDown className="w-[15px] h-[15px]" aria-hidden="true" />
                    {isGeneratingReport ? "Generating…" : "Generate Report"}
                  </button>
                </div>
                {canWrite && (
                  <button
                    type="button"
                    onClick={openCreate}
                    className="inline-flex h-[38px] items-center gap-[7px] rounded-[8px] bg-[var(--accent)] px-[15px] text-[13.5px] font-semibold text-white hover:bg-[var(--accent-ink)]"
                  >
                    <UserPlus className="w-[15px] h-[15px]" aria-hidden="true" />
                    Add Guest
                  </button>
                )}
              </div>
              {reportError && <p role="alert">{reportError}</p>}

              {/* 2026-08-06: standard 2-color blue/gold duo (was 3 colors:
                  blue/green/gold) via `.stat-duo-grid`, same as every other
                  stat-card row — grid instead of flex so the cards stretch
                  to fill the row (a bit longer than the old content-sized
                  tiles) instead of shrinking to their text. */}
              <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3 stat-duo-grid">
                <StatCard
                  bg="var(--tone-blue-bg)"
                  color="var(--color-brand-blue)"
                  value={summary.registered}
                  label="Guests Registered"
                />
                <StatCard
                  bg="var(--tone-teal-bg)"
                  color="var(--color-tone-teal-text)"
                  value={summary.paid}
                  label="Payments Received"
                />
                <StatCard
                  bg="var(--tone-amber-bg)"
                  color="var(--color-tone-amber-text)"
                  value={formatCurrency(summary.totalAmount)}
                  label="Total Amount Collected"
                />
                <StatCard
                  bg="var(--tone-blue-bg)"
                  color="var(--color-brand-blue)"
                  value={summary.invitedGuests}
                  label="Guests (invited)"
                />
              </div>

              {/* 2026-08-06: compact per-table + per-contact-rotarian
                  breakdowns (guest count + paid/invited/pending split) —
                  kept deliberately small: 11px text, tight padding, no card
                  shadow/elevation, just a hairline border, side by side so
                  they read as a lightweight aside under the summary cards
                  rather than another big block. */}
              {(tableBreakdown.length > 0 || contactRotarianBreakdown.length > 0) && (
                <div className="mb-4 flex flex-wrap items-start gap-6">
                  {tableBreakdown.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-muted-text)]">
                        Guests per table
                      </div>
                      <div className="inline-block overflow-x-auto rounded-lg border border-[var(--color-border-light)]">
                        <table className="border-collapse text-left text-[11.5px]">
                          <thead>
                            <tr className="border-b border-[var(--color-border-light)]">
                              <th className="px-2.5 py-1.5 font-bold text-[var(--color-muted-text)]">Table</th>
                              <th className="px-2.5 py-1.5 font-bold text-[var(--color-muted-text)]">Theme Name</th>
                              <th className="px-2.5 py-1.5 font-bold text-[var(--color-muted-text)]">Rotary Name</th>
                              <th className="px-2.5 py-1.5 font-bold text-[var(--color-muted-text)]">Guests</th>
                              <th className="px-2.5 py-1.5 font-bold text-[var(--color-tone-teal-text)]">Paid</th>
                              <th className="px-2.5 py-1.5 font-bold text-[var(--color-brand-blue)]">Invited</th>
                              <th className="px-2.5 py-1.5 font-bold text-[var(--color-tone-rose-text)]">Pending</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tableBreakdown.map((row) => {
                              const table = tableByNumber.get(row.tableNumber);
                              return (
                                <tr
                                  key={row.tableNumber ?? "unassigned"}
                                  className="border-b border-[var(--color-border-light)] last:border-0"
                                >
                                  <td className="px-2.5 py-1">
                                    <TableChip tone={tableToneFor(row.tableNumber)} small>
                                      {row.tableNumber ?? "—"}
                                    </TableChip>
                                  </td>
                                  <td className="px-2.5 py-1">
                                    <TableChip tone={tableToneFor(row.tableNumber)}>
                                      {table?.theme_name || "—"}
                                    </TableChip>
                                  </td>
                                  <td className="px-2.5 py-1">
                                    <TableChip tone={tableToneFor(row.tableNumber)}>
                                      {table?.rotary_name || "—"}
                                    </TableChip>
                                  </td>
                                  <td className="px-2.5 py-1">{row.total}</td>
                                  <td className="px-2.5 py-1">{row.paid}</td>
                                  <td className="px-2.5 py-1">{row.guestCount}</td>
                                  <td className="px-2.5 py-1">{row.pending}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {contactRotarianBreakdown.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-muted-text)]">
                        Guests per contact Rotarian
                      </div>
                      <div className="inline-block overflow-x-auto rounded-lg border border-[var(--color-border-light)]">
                        <table className="border-collapse text-left text-[11.5px]">
                          <thead>
                            <tr className="border-b border-[var(--color-border-light)]">
                              <th className="px-2.5 py-1.5 font-bold text-[var(--color-muted-text)]">
                                Contact Rotarian
                              </th>
                              <th className="px-2.5 py-1.5 font-bold text-[var(--color-muted-text)]">Guests</th>
                              <th className="px-2.5 py-1.5 font-bold text-[var(--color-tone-teal-text)]">Paid</th>
                              <th className="px-2.5 py-1.5 font-bold text-[var(--color-brand-blue)]">Invited</th>
                              <th className="px-2.5 py-1.5 font-bold text-[var(--color-tone-rose-text)]">Pending</th>
                            </tr>
                          </thead>
                          <tbody>
                            {contactRotarianBreakdown.map((row) => (
                              <tr
                                key={row.contactRotarianName || "unassigned"}
                                className="border-b border-[var(--color-border-light)] last:border-0"
                              >
                                <td className="px-2.5 py-1">{row.contactRotarianName || "—"}</td>
                                <td className="px-2.5 py-1">{row.total}</td>
                                <td className="px-2.5 py-1">{row.paid}</td>
                                <td className="px-2.5 py-1">{row.guestCount}</td>
                                <td className="px-2.5 py-1">{row.pending}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {guests.length === 0 ? (
                <p className="member-empty-state">No guests registered for this event yet.</p>
              ) : (
                <>
                  <div className="mb-3 pl-0.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]">
                    Guest List
                  </div>

                  <div className="mb-[22px] flex flex-wrap items-center gap-[10px]">
                    <div className="flex h-[38px] flex-1 min-w-[240px] items-center gap-[9px] rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-[13px]">
                      <Search className="w-4 h-4 shrink-0 text-[var(--faint)]" aria-hidden="true" />
                      <input
                        type="text"
                        placeholder="Search guests…"
                        aria-label="Search guests"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full border-none bg-transparent text-[13.5px] text-[var(--ink)] outline-none placeholder:text-[var(--faint)]"
                      />
                    </div>
                    <MultiSelectDropdown
                      icon={Filter}
                      ariaLabel="Payment status"
                      allLabel="All payments"
                      options={[
                        { value: "paid", label: "Paid" },
                        { value: "not_paid", label: "Not Paid" },
                        { value: "guest", label: "Invited" },
                      ]}
                      selected={paymentFilters}
                      onToggleOption={(value) => toggleFilter(setPaymentFilters, value)}
                      onClear={() => setPaymentFilters([])}
                    />
                    <MultiSelectDropdown
                      icon={Filter}
                      ariaLabel="Early bird"
                      allLabel="Early bird: All"
                      options={[
                        { value: "yes", label: "Early bird: Yes" },
                        { value: "no", label: "Early bird: No" },
                      ]}
                      selected={earlyBirdFilters}
                      onToggleOption={(value) => toggleFilter(setEarlyBirdFilters, value)}
                      onClear={() => setEarlyBirdFilters([])}
                    />
                    <MultiSelectDropdown
                      icon={Filter}
                      ariaLabel="Table number"
                      allLabel="All tables"
                      options={tableNumberOptions}
                      selected={tableFilters}
                      onToggleOption={(value) => toggleFilter(setTableFilters, value)}
                      onClear={() => setTableFilters([])}
                    />
                    <MultiSelectDropdown
                      icon={Filter}
                      ariaLabel="Contact Rotarian"
                      allLabel="All contact rotarians"
                      options={contactRotarianOptions.map((name) => ({ value: name, label: name }))}
                      selected={contactRotarianFilters}
                      onToggleOption={(value) => toggleFilter(setContactRotarianFilters, value)}
                      onClear={() => setContactRotarianFilters([])}
                    />
                  </div>

                  {visibleGuests.length === 0 ? (
                    <p className="member-empty-state">No guests match your search or filters.</p>
                  ) : (
                    <div className="overflow-hidden">
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="border-b border-[var(--color-border-faint)]">
                            {SORTABLE_COLUMNS.map(({ key, label }) => (
                              <th
                                key={key}
                                className={`${key === "table_number" ? "px-2 w-14" : "px-4"} py-3 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]`}
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
                          {visibleGuests.map((guest) => {
                            const table = tableByNumber.get(guest.table_number);
                            return (
                              <tr
                                key={guest.id}
                                className="border-b border-[var(--color-border-light)] text-[13px] text-[var(--text-h)] last:border-b-0"
                              >
                                <td className="px-4 py-[13px]">{guest.title || "—"}</td>
                                <td className="px-4 py-[13px] font-semibold">{guest.surname}</td>
                                <td className="px-4 py-[13px]">{guest.first_name}</td>
                                <td className="px-4 py-[13px] text-[var(--color-muted-text)]">
                                  {guest.contact_rotarian_name || "—"}
                                </td>
                                <td className="px-4 py-[13px]">
                                  <PaymentChip
                                    status={guest.payment_status}
                                    onClick={() => handleTogglePaid(guest)}
                                  />
                                </td>
                                <td className="px-4 py-[13px]">
                                  <EarlyBirdChip
                                    earlyBird={guest.early_bird}
                                    onClick={() => handleToggleEarlyBird(guest)}
                                  />
                                </td>
                                <td className="px-2 py-[13px] text-center">
                                  <TableNumberField
                                    guest={guest}
                                    onBlurValue={(value) => handleTableNumberBlur(guest, value)}
                                    error={tableNumberErrors[guest.id]}
                                  />
                                </td>
                                <td className="px-4 py-[13px]">
                                  <TableChip tone={tableToneFor(guest.table_number)}>
                                    {table?.theme_name || "—"}
                                  </TableChip>
                                </td>
                                <td className="px-4 py-[13px]">
                                  <TableChip tone={tableToneFor(guest.table_number)}>
                                    {table?.rotary_name || "—"}
                                  </TableChip>
                                </td>
                                <td className="px-4 py-[13px]">
                                  {canWrite && (
                                    <div className="flex gap-1">
                                      <button
                                        type="button"
                                        onClick={() => openEdit(guest)}
                                        title="Edit"
                                        className="event-iact"
                                      >
                                        <Pencil className="w-[14px] h-[14px]" aria-hidden="true" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDelete(guest)}
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
        </>
      )}

      {isFormOpen && selectedEvent && (
        <EventGuestFormModal
          eventId={selectedEvent.id}
          guest={editingGuest}
          members={members}
          tableMapping={tableMapping}
          onClose={() => setIsFormOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
