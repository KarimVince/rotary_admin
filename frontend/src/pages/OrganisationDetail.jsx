import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getOrganisation } from "../api/organisations";
import {
  createDonation,
  deleteDonation,
  listOrganisationDonations,
  updateDonation,
} from "../api/donations";
import { useAuth } from "../hooks/useAuth";
import { currentRotaryYear, rotaryYear, rotaryYearLabel } from "../utils/rotaryYear";
import { CURRENCIES, currencyLabel } from "../data/currencies";

const EMPTY_FORM = { amount: "", donation_date: "", currency: "HKD", notes: "" };

function formatAmount(amount, currency) {
  return `${Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

export default function OrganisationDetail() {
  const { organisationId } = useParams();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const thisRotaryYear = currentRotaryYear();

  const [organisation, setOrganisation] = useState(null);
  const [donations, setDonations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  async function loadDonations() {
    const data = await listOrganisationDonations(organisationId);
    setDonations(data);
  }

  async function loadAll() {
    setIsLoading(true);
    try {
      const [org] = await Promise.all([getOrganisation(organisationId), loadDonations()]);
      setOrganisation(org);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.detail || "Failed to load organisation");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organisationId]);

  const formRotaryYear = useMemo(() => rotaryYear(form.donation_date), [form.donation_date]);

  const { currentYearDonations, pastDonations, totalsByCurrency } = useMemo(() => {
    const current = [];
    const past = [];
    // Totals are kept separate per currency — summing HKD + USD into one
    // number would be meaningless without FX conversion (Story 3.7).
    const totals = {};
    donations.forEach((donation) => {
      totals[donation.currency] = (totals[donation.currency] ?? 0) + Number(donation.amount);
      if (donation.rotary_year === thisRotaryYear) current.push(donation);
      else past.push(donation);
    });
    return { currentYearDonations: current, pastDonations: past, totalsByCurrency: totals };
  }, [donations, thisRotaryYear]);

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setSaveError(null);
  }

  function startEdit(donation) {
    setEditingId(donation.id);
    setForm({
      amount: String(donation.amount),
      donation_date: donation.donation_date,
      currency: donation.currency,
      notes: donation.notes ?? "",
    });
    setSaveError(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError(null);
    setIsSaving(true);
    try {
      const payload = {
        amount: Number(form.amount),
        donation_date: form.donation_date,
        currency: form.currency || "HKD",
        notes: form.notes === "" ? null : form.notes,
      };
      if (editingId) {
        await updateDonation(editingId, payload);
      } else {
        await createDonation(organisationId, payload);
      }
      resetForm();
      await loadDonations();
    } catch (err) {
      setSaveError(err.detail || "Failed to save donation");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(donation) {
    if (!window.confirm("Delete this donation?")) return;
    await deleteDonation(donation.id);
    if (editingId === donation.id) resetForm();
    await loadDonations();
  }

  function renderRow(donation, highlight) {
    return (
      <tr key={donation.id} className={highlight ? "donation-row-current" : undefined}>
        <td>{rotaryYearLabel(donation.rotary_year)}</td>
        <td>{formatAmount(donation.amount, donation.currency)}</td>
        <td>{donation.donation_date}</td>
        <td>{donation.notes ?? "—"}</td>
        {isAdmin && (
          <td>
            <button type="button" onClick={() => startEdit(donation)}>
              Edit
            </button>
            <button type="button" onClick={() => handleDelete(donation)}>
              Delete
            </button>
          </td>
        )}
      </tr>
    );
  }

  if (isLoading) {
    return (
      <div className="admin-page">
        <p>Loading…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="admin-page">
        <p role="alert">{loadError}</p>
        <Link to="/ngos">← Back to organisations</Link>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <Link to="/ngos">← Back to organisations</Link>
      <h1>{organisation.name}</h1>
      <div className="org-detail-meta">
        {organisation.country && <p>Country: {organisation.country}</p>}
        {organisation.description && <p>{organisation.description}</p>}
        {organisation.contact_name && <p>Contact: {organisation.contact_name}</p>}
        {organisation.contact_email && <p>Email: {organisation.contact_email}</p>}
        {organisation.contact_phone && <p>Phone: {organisation.contact_phone}</p>}
        {organisation.first_supported_year && (
          <p>First supported: {organisation.first_supported_year}</p>
        )}
        <p>
          <strong>
            Total donated (all years):{" "}
            {Object.keys(totalsByCurrency).length === 0
              ? formatAmount(0, "HKD")
              : Object.entries(totalsByCurrency)
                  .map(([currency, sum]) => formatAmount(sum, currency))
                  .join(", ")}
          </strong>
        </p>
      </div>

      <section className="donation-current-section">
        <h2>Current rotary year ({rotaryYearLabel(thisRotaryYear)})</h2>
        {currentYearDonations.length === 0 ? (
          <p className="member-empty-state">No donations recorded this rotary year yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Rotary year</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Notes</th>
                {isAdmin && <th aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>{currentYearDonations.map((donation) => renderRow(donation, true))}</tbody>
          </table>
        )}
      </section>

      {isAdmin && (
        <section className="donation-form-section">
          <h2>{editingId ? "Edit donation" : "Add donation"}</h2>
          <form onSubmit={handleSubmit} className="donation-form">
            <div>
              <label htmlFor="donation-amount">Amount</label>
              <input
                id="donation-amount"
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
                required
              />
            </div>
            <div>
              <label htmlFor="donation-currency">Currency</label>
              <select
                id="donation-currency"
                value={form.currency}
                onChange={(event) => setForm({ ...form, currency: event.target.value })}
              >
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {currencyLabel(code)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="donation-date">Date</label>
              <input
                id="donation-date"
                type="date"
                value={form.donation_date}
                onChange={(event) => setForm({ ...form, donation_date: event.target.value })}
                required
              />
            </div>
            <div>
              <label htmlFor="donation-rotary-year">Rotary year</label>
              <input
                id="donation-rotary-year"
                type="text"
                readOnly
                value={formRotaryYear === null ? "" : rotaryYearLabel(formRotaryYear)}
                placeholder="Auto from date"
              />
            </div>
            <div className="field-full">
              <label htmlFor="donation-notes">Notes</label>
              <input
                id="donation-notes"
                type="text"
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </div>
            {saveError && <p role="alert">{saveError}</p>}
            <div className="modal-actions">
              <button type="submit" disabled={isSaving}>
                {isSaving ? "Saving…" : editingId ? "Update donation" : "Add donation"}
              </button>
              {editingId && (
                <button type="button" onClick={resetForm}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>
      )}

      <section className="donation-history-section">
        <h2>Donation history (past years)</h2>
        {pastDonations.length === 0 ? (
          <p className="member-empty-state">No historical donations.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Rotary year</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Notes</th>
                {isAdmin && <th aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>{pastDonations.map((donation) => renderRow(donation, false))}</tbody>
          </table>
        )}
      </section>
    </div>
  );
}
