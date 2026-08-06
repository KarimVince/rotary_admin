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
import Card from "../components/Card";
import MultiSelectDropdown from "../components/MultiSelectDropdown";
import { useTheme } from "../context/ThemeContext";

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

function StatTile({ bg, color, value, label, isMinimal }) {
  return (
    <div
      className={isMinimal ? "rounded-[var(--r)] p-[14px_18px]" : "rounded-2xl p-[14px_18px]"}
      style={{ background: bg }}
    >
      <span className="block text-[20px] font-bold" style={{ color }}>
        {value}
      </span>
      <span className={isMinimal ? "text-[12px] text-[var(--muted)]" : "text-[12px] text-[var(--text)]"}>
        {label}
      </span>
    </div>
  );
}

const PAYMENT_STATUS_CYCLE = { paid: "not_paid", not_paid: "guest", guest: "paid" };

const PAYMENT_CHIP_STYLES = {
  paid: "bg-[var(--tone-teal-bg)] text-[var(--color-tone-teal-text)]",
  not_paid: "bg-[var(--tone-rose-bg)] text-[var(--color-tone-rose-text)]",
  guest: "bg-[var(--tone-blue-bg)] text-[var(--color-brand-blue)]",
};

const PAYMENT_CHIP_STYLES_MINIMAL = {
  paid: "bg-[var(--ok-bg)] text-[var(--ok)]",
  not_paid: "bg-[var(--low-bg)] text-[var(--low)]",
  guest: "bg-[var(--accent-soft)] text-[var(--accent-ink)]",
};

const PAYMENT_CHIP_LABELS = { paid: "Paid", not_paid: "Not Paid", guest: "Guest" };

function PaymentChip({ status, onClick, isMinimal }) {
  const styles = isMinimal ? PAYMENT_CHIP_STYLES_MINIMAL : PAYMENT_CHIP_STYLES;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-fit rounded-full px-[10px] py-[3px] text-[11px] font-bold ${styles[status]}`}
    >
      {PAYMENT_CHIP_LABELS[status]}
    </button>
  );
}

export default function EventGuestList({ event: selectedEvent }) {
  const { isMinimal } = useTheme();
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

  async function loadGuestData() {
    // No early "not loading" reset here when selectedEvent is briefly null
    // (events fetched but useSelectedEvent hasn't picked a default yet) —
    // that would flip isLoadingGuestData false-then-true-then-false again,
    // a flash the summary cards would render zeros during.
    if (!selectedEvent) return;
    setIsLoadingGuestData(true);
    const [guestsData, tableData, setupData] = await Promise.all([
      listEventGuests(selectedEvent.id),
      listTableMapping(selectedEvent.id),
      getEventSetup(selectedEvent.id),
    ]);
    setGuests(guestsData);
    setTableMapping(tableData);
    setSetup(setupData);
    setIsLoadingGuestData(false);
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
    loadGuestData();
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
      {!isMinimal && (
        <div className="mb-5 flex items-center justify-between">
          <h1 className="m-0 text-2xl font-semibold text-[var(--text-h)]">Guest List</h1>
          {canWrite && selectedEvent && (
            <button
              type="button"
              onClick={openCreate}
              className="rounded-[10px] bg-[var(--color-brand-blue)] px-[18px] py-[9px] text-[13px] font-semibold text-white"
            >
              + Add Guest
            </button>
          )}
        </div>
      )}

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && (
        <>
          {selectedEvent && isLoadingGuestData && <p>Loading guest data…</p>}

          {selectedEvent && !isLoadingGuestData && (
            <>
              <div className={`mb-4 flex ${isMinimal ? "items-end justify-between" : "items-center"} gap-3`}>
                <div className={isMinimal ? "flex items-end gap-3" : "flex items-center gap-3"}>
                  {isMinimal ? (
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
                  ) : (
                    <>
                      <label htmlFor="guest-report-format" className="sr-only">
                        Format
                      </label>
                      <select
                        id="guest-report-format"
                        value={reportFormat}
                        onChange={(e) => setReportFormat(e.target.value)}
                        disabled={isGeneratingReport}
                        className="rounded-[10px] border border-[var(--color-border-medium)] px-3 py-2 text-[13px]"
                      >
                        <option value="pdf">PDF</option>
                        <option value="csv">CSV</option>
                      </select>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={handleGenerateReport}
                    disabled={isGeneratingReport}
                    className={
                      isMinimal
                        ? "inline-flex h-[38px] items-center gap-[7px] rounded-[8px] border border-[var(--border)] bg-transparent px-[15px] text-[13.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--bg-alt)]"
                        : "rounded-[10px] bg-[var(--color-brand-blue-light)] px-4 py-[9px] text-[13px] font-semibold text-[var(--color-brand-blue)]"
                    }
                  >
                    {isMinimal && <FileDown className="w-[15px] h-[15px]" aria-hidden="true" />}
                    {isGeneratingReport ? "Generating…" : "Generate Report"}
                  </button>
                </div>
                {isMinimal && canWrite && (
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

              <div className="mb-4 flex gap-3">
                <StatTile
                  isMinimal={isMinimal}
                  bg={isMinimal ? "var(--accent-soft)" : "var(--tone-blue-bg)"}
                  color={isMinimal ? "var(--accent-ink)" : "var(--color-brand-blue)"}
                  value={summary.registered}
                  label="Guests Registered"
                />
                <StatTile
                  isMinimal={isMinimal}
                  bg={isMinimal ? "var(--ok-bg)" : "var(--tone-teal-bg)"}
                  color={isMinimal ? "var(--ok)" : "var(--color-tone-teal-text)"}
                  value={summary.paid}
                  label="Payments Received"
                />
                <StatTile
                  isMinimal={isMinimal}
                  bg={isMinimal ? "var(--gold-soft)" : "var(--tone-amber-bg)"}
                  color={isMinimal ? "var(--gold-ink)" : "var(--color-tone-amber-text)"}
                  value={formatCurrency(summary.totalAmount)}
                  label="Total Amount Collected"
                />
                <StatTile
                  isMinimal={isMinimal}
                  bg={isMinimal ? "var(--accent-soft)" : "var(--tone-blue-bg)"}
                  color={isMinimal ? "var(--accent-ink)" : "var(--color-brand-blue)"}
                  value={summary.invitedGuests}
                  label="Guests (invited)"
                />
              </div>

              {guests.length === 0 ? (
                <p className="member-empty-state">No guests registered for this event yet.</p>
              ) : isMinimal ? (
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
                        { value: "guest", label: "Guest" },
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
                                    isMinimal={isMinimal}
                                  />
                                </td>
                                <td className="px-4 py-[13px]">{guest.early_bird ? "Yes" : "No"}</td>
                                <td className="px-4 py-[13px]">{guest.table_number ?? "—"}</td>
                                <td className="px-4 py-[13px] text-[var(--color-muted-text)]">
                                  {table?.theme_name || "—"}
                                </td>
                                <td className="px-4 py-[13px] text-[var(--color-muted-text)]">
                                  {table?.rotary_name || "—"}
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
              ) : (
                <Card variant="default" className="p-0 overflow-hidden">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-[var(--color-border-faint)]">
                        {[
                          "Title",
                          "Surname",
                          "First Name",
                          "Contact Rotarian",
                          "Payment Status",
                          "Early Bird",
                          "Table Number",
                          "Theme Name",
                          "Rotary Name",
                          "Actions",
                        ].map((label) => (
                          <th
                            key={label}
                            className="px-4 py-3 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]"
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {guests.map((guest) => {
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
                                isMinimal={isMinimal}
                              />
                            </td>
                            <td className="px-4 py-[13px]">{guest.early_bird ? "Yes" : "No"}</td>
                            <td className="px-4 py-[13px]">{guest.table_number ?? "—"}</td>
                            <td className="px-4 py-[13px] text-[var(--color-muted-text)]">
                              {table?.theme_name || "—"}
                            </td>
                            <td className="px-4 py-[13px] text-[var(--color-muted-text)]">
                              {table?.rotary_name || "—"}
                            </td>
                            <td className="px-4 py-[13px]">
                              {canWrite && (
                                <div className="flex gap-3">
                                  <button
                                    type="button"
                                    onClick={() => openEdit(guest)}
                                    className="bg-transparent p-0 text-[12px] font-semibold text-[var(--color-brand-blue)]"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(guest)}
                                    className="bg-transparent p-0 text-[12px] font-semibold text-[var(--color-tone-rose-text)]"
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </Card>
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
