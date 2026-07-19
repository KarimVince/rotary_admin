import { useEffect, useMemo, useState } from "react";
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

function StatTile({ bg, color, value, label }) {
  return (
    <div className="rounded-2xl p-[14px_18px]" style={{ background: bg }}>
      <span className="block text-[20px] font-bold" style={{ color }}>
        {value}
      </span>
      <span className="text-[12px] text-[#3c4655]">{label}</span>
    </div>
  );
}

const PAYMENT_STATUS_CYCLE = { paid: "not_paid", not_paid: "guest", guest: "paid" };

const PAYMENT_CHIP_STYLES = {
  paid: "bg-[var(--tone-teal-bg)] text-[var(--color-tone-teal-text)]",
  not_paid: "bg-[var(--tone-rose-bg)] text-[var(--color-tone-rose-text)]",
  guest: "bg-[var(--tone-blue-bg)] text-[var(--color-brand-blue)]",
};

const PAYMENT_CHIP_LABELS = { paid: "Paid", not_paid: "Not Paid", guest: "Guest" };

function PaymentChip({ status, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-fit rounded-full px-[10px] py-[3px] text-[11px] font-bold ${PAYMENT_CHIP_STYLES[status]}`}
    >
      {PAYMENT_CHIP_LABELS[status]}
    </button>
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
      <div className="mb-5 flex items-center justify-between">
        <h1 className="m-0 text-2xl font-semibold text-[#0c2340]">Guest List</h1>
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

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && (
        <>
          {selectedEvent && isLoadingGuestData && <p>Loading guest data…</p>}

          {selectedEvent && !isLoadingGuestData && (
            <>
              <div className="mb-4 flex items-center gap-3">
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
                <button
                  type="button"
                  onClick={handleGenerateReport}
                  disabled={isGeneratingReport}
                  className="rounded-[10px] bg-[var(--color-brand-blue-light)] px-4 py-[9px] text-[13px] font-semibold text-[var(--color-brand-blue)]"
                >
                  {isGeneratingReport ? "Generating…" : "Generate Report"}
                </button>
              </div>
              {reportError && <p role="alert">{reportError}</p>}

              <div className="mb-4 flex gap-3">
                <StatTile
                  bg="var(--tone-blue-bg)"
                  color="var(--color-brand-blue)"
                  value={summary.registered}
                  label="Guests Registered"
                />
                <StatTile
                  bg="var(--tone-teal-bg)"
                  color="var(--color-tone-teal-text)"
                  value={summary.paid}
                  label="Payments Received"
                />
                <StatTile
                  bg="var(--tone-amber-bg)"
                  color="var(--color-tone-amber-text)"
                  value={formatCurrency(summary.totalAmount)}
                  label="Total Amount Collected"
                />
                <StatTile
                  bg="var(--tone-blue-bg)"
                  color="var(--color-brand-blue)"
                  value={summary.invitedGuests}
                  label="Guests (invited)"
                />
              </div>

              {guests.length === 0 ? (
                <p className="member-empty-state">No guests registered for this event yet.</p>
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
                            className="border-b border-[var(--color-border-light)] text-[13px] text-[#0c2340] last:border-b-0"
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
