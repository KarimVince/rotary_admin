import { useEffect, useMemo, useState } from "react";
import {
  createAdhocDonation,
  deleteAdhocDonation,
  fetchFundraisingSummary,
  listAdhocDonations,
  updateAdhocDonation,
} from "../api/finance";
import Card from "../components/Card";
import { useAccess } from "../hooks/useAccess";
import { useRotaryYears } from "../hooks/useRotaryYears";
import { useWindowFocusRefetch } from "../hooks/useWindowFocusRefetch";
import { INPUT_CLASS, SELECT_CLASS } from "../styles/formControls";
import { formatDate } from "../utils/formatters";
import { rotaryYear, rotaryYearLabel } from "../utils/rotaryYear";

function formatCurrency(value) {
  return `${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} HKD`;
}

function StatCard({ value, label }) {
  return (
    <Card variant="stat-teal" className="flex min-h-[104px] flex-col justify-center">
      <div className="text-xs font-semibold text-[var(--color-muted-text)]">{label}</div>
      <div className="mt-1 text-[22px] font-bold">{value}</div>
    </Card>
  );
}

const SUBMIT_BUTTON_CLASS =
  "rounded-lg px-4 py-2 text-[13.5px] font-semibold text-white bg-[var(--color-brand-blue)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border-none";
const CANCEL_BUTTON_CLASS =
  "rounded-lg px-4 py-2 text-[13.5px] font-semibold text-[var(--color-brand-blue)] bg-white border border-[var(--color-brand-blue)] cursor-pointer";

const EMPTY_FORM = { donation_date: "", description: "", amount: "" };

// Story 17.3 — Finance module, Fund Raising Results page. Own nav entry
// under Finance (see Story 17.2 follow-up in AppLayout.jsx — every Finance
// page is its own matrix submenu key, not a shared tabbed page).
export default function FinanceFundraising() {
  const { canRead, canWrite } = useAccess("finance.fundraising");
  const { yearOptions, selectedYear: year, setSelectedYear: setYear } = useRotaryYears();
  const [summary, setSummary] = useState(null);
  const [adhocDonations, setAdhocDonations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  async function loadData({ silent = false } = {}) {
    if (!silent) setIsLoading(true);
    setLoadError(null);
    try {
      const [summaryData, adhocData] = await Promise.all([
        fetchFundraisingSummary({ rotary_year: year }),
        listAdhocDonations({ rotary_year: year }),
      ]);
      setSummary(summaryData);
      setAdhocDonations(adhocData);
    } catch (err) {
      if (!silent) setLoadError(err.detail || "Failed to load fund raising results");
    } finally {
      if (!silent) setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, canRead]);

  // Event fundraising (auction/lucky draw) is computed from the Event
  // module's own data — refetch quietly when the user comes back to this
  // tab so an edit made there (in another tab) shows up without a full
  // page reload.
  useWindowFocusRefetch(() => loadData({ silent: true }), canRead);

  const formRotaryYear = useMemo(
    () => (form.donation_date ? rotaryYear(form.donation_date) : null),
    [form.donation_date],
  );

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setSaveError(null);
  }

  function startEdit(donation) {
    setEditingId(donation.id);
    setForm({
      donation_date: donation.donation_date,
      description: donation.description,
      amount: String(donation.amount),
    });
    setSaveError(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError(null);
    setIsSaving(true);
    try {
      const payload = {
        donation_date: form.donation_date,
        description: form.description,
        amount: Number(form.amount),
      };
      if (editingId) {
        await updateAdhocDonation(editingId, payload);
      } else {
        await createAdhocDonation(payload);
      }
      resetForm();
      await loadData();
    } catch (err) {
      setSaveError(err.detail || "Failed to save donation");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(donation) {
    if (!window.confirm("Delete this ad hoc donation?")) return;
    await deleteAdhocDonation(donation.id);
    if (editingId === donation.id) resetForm();
    await loadData();
  }

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>Fund Raising Results</h1>
        <p role="alert">You do not have permission to view Fund Raising Results.</p>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page-wide">
      <div className="mb-1">
        <h1 className="mb-1">Fund Raising Results</h1>
        <p className="text-sm text-[var(--color-muted-text)]">
          Money raised through events (lucky draw, auction) plus manually entered ad hoc
          donations.
        </p>
      </div>

      <div className="flex items-center gap-3 mb-4 mt-4">
        <label htmlFor="fundraising-year" className="text-sm font-semibold">
          Rotary Year
        </label>
        <select
          id="fundraising-year"
          className={SELECT_CLASS}
          value={year}
          onChange={(event) => setYear(Number(event.target.value))}
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {rotaryYearLabel(y)}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p>Loading…</p>}
      {loadError && (
        <p role="alert" className="text-[var(--color-danger)]">
          {loadError}
        </p>
      )}

      {!isLoading && !loadError && summary && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <StatCard
              value={formatCurrency(summary.event_fundraising_total)}
              label="Event fundraising"
            />
            <StatCard
              value={formatCurrency(summary.adhoc_donations_total)}
              label="Ad hoc donations"
            />
            <StatCard value={formatCurrency(summary.combined_total)} label="Combined total" />
          </div>

          <section className="mb-6">
            <h2 className="text-[17px] font-bold text-[var(--color-brand-blue)] mb-3">
              Event fundraising
            </h2>
            {summary.events.length === 0 ? (
              <p className="text-sm text-[var(--color-muted-text)]">
                No event fundraising income recorded for this rotary year.
              </p>
            ) : (
              <Card variant="default" className="!p-0 !rounded-2xl overflow-hidden">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border-faint)]">
                      <th className="px-5 py-3 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]">
                        Event
                      </th>
                      <th className="px-5 py-3 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]">
                        Date
                      </th>
                      <th className="px-5 py-3 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]">
                        Auction
                      </th>
                      <th className="px-5 py-3 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]">
                        Lucky Draw
                      </th>
                      <th className="px-5 py-3 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]">
                        Other Donations
                      </th>
                      <th className="px-5 py-3 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.events.map((row) => (
                      <tr key={row.event_id} className="border-b border-[var(--color-border-faint)] last:border-0">
                        <td className="px-5 py-3">{row.event_name}</td>
                        <td className="px-5 py-3">{formatDate(row.event_date)}</td>
                        <td className="px-5 py-3">{formatCurrency(row.auction_total)}</td>
                        <td className="px-5 py-3">{formatCurrency(row.lucky_draw_total)}</td>
                        <td className="px-5 py-3">{formatCurrency(row.other_donation_total)}</td>
                        <td className="px-5 py-3 font-semibold">{formatCurrency(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </section>

          <section className="mb-6">
            <h2 className="text-[17px] font-bold text-[var(--color-brand-blue)] mb-3">
              Ad hoc donations
            </h2>
            {adhocDonations.length === 0 ? (
              <p className="text-sm text-[var(--color-muted-text)]">
                No ad hoc donations recorded for this rotary year.
              </p>
            ) : (
              <Card variant="default" className="!p-0 !rounded-2xl overflow-hidden">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border-faint)]">
                      <th className="px-5 py-3 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]">
                        Date
                      </th>
                      <th className="px-5 py-3 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]">
                        Description
                      </th>
                      <th className="px-5 py-3 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]">
                        Amount
                      </th>
                      {canWrite && (
                        <th
                          aria-label="Actions"
                          className="px-5 py-3 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]"
                        />
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {adhocDonations.map((donation) => (
                      <tr key={donation.id} className="border-b border-[var(--color-border-faint)] last:border-0">
                        <td className="px-5 py-3">{formatDate(donation.donation_date)}</td>
                        <td className="px-5 py-3">{donation.description}</td>
                        <td className="px-5 py-3">{formatCurrency(donation.amount)}</td>
                        {canWrite && (
                          <td className="px-5 py-3 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => startEdit(donation)}
                              className="text-[var(--color-brand-blue)] bg-transparent border-none cursor-pointer font-semibold text-[13px] mr-3"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(donation)}
                              className="text-[var(--color-danger)] bg-transparent border-none cursor-pointer font-semibold text-[13px]"
                            >
                              Delete
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </section>

          {canWrite && (
            <section className="mt-6">
              <h2 className="text-[17px] font-bold text-[var(--color-brand-blue)] mb-3">
                {editingId ? "Edit ad hoc donation" : "Add ad hoc donation"}
              </h2>
              <Card variant="default" className="!p-5 !rounded-2xl max-w-[700px]">
                <form onSubmit={handleSubmit} className="donation-form">
                  <div>
                    <label htmlFor="adhoc-date">Date</label>
                    <input
                      id="adhoc-date"
                      type="date"
                      value={form.donation_date}
                      onChange={(event) => setForm({ ...form, donation_date: event.target.value })}
                      className={INPUT_CLASS}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="adhoc-rotary-year">Rotary year</label>
                    <input
                      id="adhoc-rotary-year"
                      type="text"
                      readOnly
                      value={formRotaryYear === null ? "" : rotaryYearLabel(formRotaryYear)}
                      placeholder="Auto from date"
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label htmlFor="adhoc-amount">Amount (HKD)</label>
                    <input
                      id="adhoc-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.amount}
                      onChange={(event) => setForm({ ...form, amount: event.target.value })}
                      className={INPUT_CLASS}
                      required
                    />
                  </div>
                  <div className="field-full">
                    <label htmlFor="adhoc-description">Description / source</label>
                    <input
                      id="adhoc-description"
                      type="text"
                      placeholder="e.g. Red box collection at dinner"
                      value={form.description}
                      onChange={(event) => setForm({ ...form, description: event.target.value })}
                      className={INPUT_CLASS}
                      required
                    />
                  </div>
                  {saveError && <p role="alert">{saveError}</p>}
                  <div className="modal-actions flex gap-3">
                    <button type="submit" disabled={isSaving} className={SUBMIT_BUTTON_CLASS}>
                      {isSaving ? "Saving…" : editingId ? "Update donation" : "Add donation"}
                    </button>
                    {editingId && (
                      <button type="button" onClick={resetForm} className={CANCEL_BUTTON_CLASS}>
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              </Card>
            </section>
          )}
        </>
      )}
    </div>
  );
}
