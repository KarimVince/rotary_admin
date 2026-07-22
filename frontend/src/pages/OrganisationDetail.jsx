import { Building2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { API_ORIGIN } from "../api/client";
import { listNgoClassifications } from "../api/ngoClassifications";
import { getOrganisation } from "../api/organisations";
import {
  createDonation,
  deleteDonation,
  listOrganisationDonations,
  updateDonation,
} from "../api/donations";
import { listMembers } from "../api/members";
import {
  createServiceHour,
  deleteServiceHour,
  listOrganisationServiceHours,
  updateServiceHour,
} from "../api/serviceHours";
import Card from "../components/Card";
import { useAccess } from "../hooks/useAccess";
import { SELECT_CLASS, INPUT_CLASS } from "../styles/formControls";
import { classificationColorClass } from "../utils/classificationColors";
import { currentRotaryYear, rotaryYear, rotaryYearLabel } from "../utils/rotaryYear";
import { CURRENCIES, currencyLabel } from "../data/currencies";

// Story 16.23: table/button styling shared by every table on this page —
// same Card-wrapped, uppercase-header, text-link-action pattern as
// EmailLogTable.jsx / MemberFees.jsx, the design baseline this story asked
// for, instead of the page's old plain `.data-table` CSS class.
const ACTION_BUTTON_CLASS = "bg-transparent border-none p-0 mr-4 text-[13px] font-semibold text-[var(--color-brand-blue)] cursor-pointer";
const DELETE_BUTTON_CLASS = "bg-transparent border-none p-0 text-[13px] font-semibold text-[var(--color-tone-rose-text)] cursor-pointer";
const SUBMIT_BUTTON_CLASS = "rounded-lg px-4 py-2 text-[13.5px] font-semibold text-white bg-[var(--color-brand-blue)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border-none";
const CANCEL_BUTTON_CLASS = "rounded-lg px-4 py-2 text-[13.5px] font-semibold text-[var(--color-brand-blue)] bg-white border border-[var(--color-brand-blue)] cursor-pointer";

function EntryTable({ columns, rows, isAdmin }) {
  return (
    <Card variant="default" className="!p-0 !rounded-2xl mt-3 overflow-hidden max-w-[900px]">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-[var(--color-border-faint)]">
            {[...columns, isAdmin ? "" : null].filter((label) => label !== null).map((label) => (
              <th
                key={label || "actions"}
                aria-label={label === "" ? "Actions" : undefined}
                className="px-5 py-3 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </Card>
  );
}

const EMPTY_FORM = { amount: "", donation_date: "", currency: "HKD", notes: "" };
// Story 16.14: same shape as EMPTY_FORM, hours instead of amount/currency.
const EMPTY_SERVICE_HOUR_FORM = { member_id: "", hours: "", service_date: "", notes: "" };

function formatHours(hours) {
  return `${Number(hours).toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} h`;
}

function formatAmount(amount, currency) {
  return `${Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function resolveLogoUrl(logoUrl) {
  if (!logoUrl) return null;
  return /^https?:\/\//.test(logoUrl) ? logoUrl : `${API_ORIGIN}${logoUrl}`;
}

export default function OrganisationDetail() {
  const { organisationId } = useParams();
  const { canRead, canWrite: isAdmin } = useAccess("ngos.organisations");
  const thisRotaryYear = currentRotaryYear();

  const [organisation, setOrganisation] = useState(null);
  const [donations, setDonations] = useState([]);
  const [serviceHours, setServiceHours] = useState([]);
  const [members, setMembers] = useState([]);
  const [classifications, setClassifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    // Non-fatal — the badge just doesn't render if this fails.
    listNgoClassifications()
      .then(setClassifications)
      .catch(() => {});
    listMembers()
      .then(setMembers)
      .catch(() => {});
  }, []);

  const classificationsById = useMemo(() => {
    const map = new Map();
    classifications.forEach((classification) => map.set(classification.id, classification));
    return map;
  }, [classifications]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const [hoursForm, setHoursForm] = useState(EMPTY_SERVICE_HOUR_FORM);
  const [editingHoursId, setEditingHoursId] = useState(null);
  const [isSavingHours, setIsSavingHours] = useState(false);
  const [hoursSaveError, setHoursSaveError] = useState(null);

  async function loadDonations() {
    const data = await listOrganisationDonations(organisationId);
    setDonations(data);
  }

  async function loadServiceHours() {
    const data = await listOrganisationServiceHours(organisationId);
    setServiceHours(data);
  }

  async function loadAll() {
    setIsLoading(true);
    try {
      const [org] = await Promise.all([
        getOrganisation(organisationId),
        loadDonations(),
        loadServiceHours(),
      ]);
      setOrganisation(org);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.detail || "Failed to load organisation");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead, organisationId]);

  const formRotaryYear = useMemo(() => rotaryYear(form.donation_date), [form.donation_date]);
  const hoursFormRotaryYear = useMemo(
    () => rotaryYear(hoursForm.service_date),
    [hoursForm.service_date],
  );

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

  const { currentYearServiceHours, pastServiceHours, totalHours, totalHoursCurrentYear } =
    useMemo(() => {
      const current = [];
      const past = [];
      let allTimeTotal = 0;
      let currentYearTotal = 0;
      serviceHours.forEach((entry) => {
        allTimeTotal += Number(entry.hours);
        if (entry.rotary_year === thisRotaryYear) {
          current.push(entry);
          currentYearTotal += Number(entry.hours);
        } else {
          past.push(entry);
        }
      });
      return {
        currentYearServiceHours: current,
        pastServiceHours: past,
        totalHours: allTimeTotal,
        totalHoursCurrentYear: currentYearTotal,
      };
    }, [serviceHours, thisRotaryYear]);

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

  function resetHoursForm() {
    setHoursForm(EMPTY_SERVICE_HOUR_FORM);
    setEditingHoursId(null);
    setHoursSaveError(null);
  }

  function startEditHours(entry) {
    setEditingHoursId(entry.id);
    setHoursForm({
      member_id: entry.member_id,
      hours: String(entry.hours),
      service_date: entry.service_date,
      notes: entry.notes ?? "",
    });
    setHoursSaveError(null);
  }

  async function handleHoursSubmit(event) {
    event.preventDefault();
    setHoursSaveError(null);
    setIsSavingHours(true);
    try {
      const payload = {
        member_id: hoursForm.member_id,
        hours: Number(hoursForm.hours),
        service_date: hoursForm.service_date,
        notes: hoursForm.notes === "" ? null : hoursForm.notes,
      };
      if (editingHoursId) {
        await updateServiceHour(editingHoursId, payload);
      } else {
        await createServiceHour(organisationId, payload);
      }
      resetHoursForm();
      await loadServiceHours();
    } catch (err) {
      setHoursSaveError(err.detail || "Failed to save service hours");
    } finally {
      setIsSavingHours(false);
    }
  }

  async function handleDeleteHours(entry) {
    if (!window.confirm("Delete this service hours entry?")) return;
    await deleteServiceHour(entry.id);
    if (editingHoursId === entry.id) resetHoursForm();
    await loadServiceHours();
  }

  const CELL_CLASS = "px-5 py-[14px] text-[14px] text-[var(--color-muted-text)]";
  const CELL_STRONG_CLASS = "px-5 py-[14px] text-[14px] font-semibold text-[#0c2340]";

  function renderHoursRow(entry, highlight) {
    return (
      <tr
        key={entry.id}
        className={`border-b border-[var(--color-border-light)] last:border-b-0 ${highlight ? "service-hour-row-current" : ""}`}
      >
        <td className={CELL_CLASS}>{rotaryYearLabel(entry.rotary_year)}</td>
        <td className={CELL_STRONG_CLASS}>{entry.member_name}</td>
        <td className={CELL_CLASS}>{formatHours(entry.hours)}</td>
        <td className={CELL_CLASS}>{entry.service_date}</td>
        <td className={CELL_CLASS}>{entry.notes ?? "—"}</td>
        {isAdmin && (
          <td className="px-5 py-[14px] text-right whitespace-nowrap">
            <button type="button" onClick={() => startEditHours(entry)} className={ACTION_BUTTON_CLASS}>
              Edit
            </button>
            <button type="button" onClick={() => handleDeleteHours(entry)} className={DELETE_BUTTON_CLASS}>
              Delete
            </button>
          </td>
        )}
      </tr>
    );
  }

  function renderRow(donation, highlight) {
    return (
      <tr
        key={donation.id}
        className={`border-b border-[var(--color-border-light)] last:border-b-0 ${highlight ? "donation-row-current" : ""}`}
      >
        <td className={CELL_CLASS}>{rotaryYearLabel(donation.rotary_year)}</td>
        <td className={CELL_STRONG_CLASS}>{formatAmount(donation.amount, donation.currency)}</td>
        <td className={CELL_CLASS}>{donation.donation_date}</td>
        <td className={CELL_CLASS}>{donation.notes ?? "—"}</td>
        {isAdmin && (
          <td className="px-5 py-[14px] text-right whitespace-nowrap">
            <button type="button" onClick={() => startEdit(donation)} className={ACTION_BUTTON_CLASS}>
              Edit
            </button>
            <button type="button" onClick={() => handleDelete(donation)} className={DELETE_BUTTON_CLASS}>
              Delete
            </button>
          </td>
        )}
      </tr>
    );
  }

  if (!canRead) {
    return (
      <div className="admin-page">
        <p role="alert">You do not have permission to view this organisation.</p>
      </div>
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
      <Link to="/ngos" className="text-[13px] font-semibold text-[var(--color-brand-blue)]">
        ← Back to organisations
      </Link>
      <div className="org-detail-header mt-3">
        {organisation.logo_url ? (
          <img
            className="org-detail-logo"
            src={resolveLogoUrl(organisation.logo_url)}
            alt=""
          />
        ) : (
          <div className="org-detail-logo org-detail-logo-fallback">
            <Building2 className="w-8 h-8" aria-hidden="true" />
          </div>
        )}
        <h1 className="text-[22px] font-bold text-[var(--color-brand-blue-dark)]">
          {organisation.name}
        </h1>
        {organisation.classification_id && classificationsById.has(organisation.classification_id) && (
          <span
            className={`inline-badge ${classificationColorClass(
              classificationsById.get(organisation.classification_id).name,
            )}`}
          >
            {classificationsById.get(organisation.classification_id).name}
          </span>
        )}
      </div>
      <div className="org-detail-meta">
        {organisation.country && <p>Country: {organisation.country}</p>}
        {organisation.description && <p>{organisation.description}</p>}
        {organisation.contact_name && <p>Contact: {organisation.contact_name}</p>}
        {organisation.contact_email && <p>Email: {organisation.contact_email}</p>}
        {organisation.contact_phone && <p>Phone: {organisation.contact_phone}</p>}
        {organisation.first_supported_year && (
          <p>First supported: {organisation.first_supported_year}</p>
        )}
      </div>

      {/* Story 16.20: distinct tinted cards (not bare text) for the two
          running totals, same tone palette used across every other
          module's stat cards. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 max-w-[700px]">
        <Card variant="stat-blue" className="!p-4">
          <p className="m-0 text-[15px] font-semibold text-[var(--color-brand-blue-dark)]">
            Total donated (all years):{" "}
            {Object.keys(totalsByCurrency).length === 0
              ? formatAmount(0, "HKD")
              : Object.entries(totalsByCurrency)
                  .map(([currency, sum]) => formatAmount(sum, currency))
                  .join(", ")}
          </p>
        </Card>
        <Card variant="stat-teal" className="!p-4">
          <p className="m-0 text-[15px] font-semibold text-[var(--color-brand-blue-dark)]">
            Total service hours (all years): {formatHours(totalHours)} — Current year (
            {rotaryYearLabel(thisRotaryYear)}): {formatHours(totalHoursCurrentYear)}
          </p>
        </Card>
      </div>

      <section className="donation-current-section">
        <h2 className="text-[17px] font-bold text-[var(--color-brand-blue)]">
          Current rotary year ({rotaryYearLabel(thisRotaryYear)})
        </h2>
        {currentYearDonations.length === 0 ? (
          <p className="member-empty-state">No donations recorded this rotary year yet.</p>
        ) : (
          <EntryTable
            columns={["Rotary year", "Amount", "Date", "Notes"]}
            isAdmin={isAdmin}
            rows={currentYearDonations.map((donation) => renderRow(donation, true))}
          />
        )}
      </section>

      {isAdmin && (
        <section className="donation-form-section mt-6">
          <h2 className="text-[17px] font-bold text-[var(--color-brand-blue)] mb-3">
            {editingId ? "Edit donation" : "Add donation"}
          </h2>
          <Card variant="default" className="!p-5 !rounded-2xl max-w-[700px]">
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
                  className={INPUT_CLASS}
                  required
                />
              </div>
              <div>
                <label htmlFor="donation-currency">Currency</label>
                <select
                  id="donation-currency"
                  value={form.currency}
                  onChange={(event) => setForm({ ...form, currency: event.target.value })}
                  className={SELECT_CLASS}
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
                  className={INPUT_CLASS}
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
                  className={INPUT_CLASS}
                />
              </div>
              <div className="field-full">
                <label htmlFor="donation-notes">Notes</label>
                <input
                  id="donation-notes"
                  type="text"
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                  className={INPUT_CLASS}
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

      <section className="donation-history-section mt-6">
        <h2 className="text-[17px] font-bold text-[var(--color-brand-blue)]">
          Donation history (past years)
        </h2>
        {pastDonations.length === 0 ? (
          <p className="member-empty-state">No historical donations.</p>
        ) : (
          <EntryTable
            columns={["Rotary year", "Amount", "Date", "Notes"]}
            isAdmin={isAdmin}
            rows={pastDonations.map((donation) => renderRow(donation, false))}
          />
        )}
      </section>

      <h2 className="service-hours-heading text-[19px] font-bold text-[var(--color-brand-blue-dark)] mt-8">
        Services
      </h2>

      <section className="service-hours-current-section">
        <h3 className="text-[17px] font-bold text-[var(--color-brand-blue)]">
          Current rotary year ({rotaryYearLabel(thisRotaryYear)})
        </h3>
        {currentYearServiceHours.length === 0 ? (
          <p className="member-empty-state">No service hours recorded this rotary year yet.</p>
        ) : (
          <EntryTable
            columns={["Rotary year", "Member", "Hours", "Date", "Notes"]}
            isAdmin={isAdmin}
            rows={currentYearServiceHours.map((entry) => renderHoursRow(entry, true))}
          />
        )}
      </section>

      {isAdmin && (
        <section className="service-hours-form-section mt-6">
          <h3 className="text-[17px] font-bold text-[var(--color-brand-blue)] mb-3">
            {editingHoursId ? "Edit service hours" : "Add services"}
          </h3>
          <Card variant="default" className="!p-5 !rounded-2xl max-w-[700px]">
            <form onSubmit={handleHoursSubmit} className="donation-form">
              <div>
                <label htmlFor="service-hour-member">Member name</label>
                <select
                  id="service-hour-member"
                  value={hoursForm.member_id}
                  onChange={(event) => setHoursForm({ ...hoursForm, member_id: event.target.value })}
                  className={SELECT_CLASS}
                  required
                >
                  <option value="" disabled>
                    Select a member
                  </option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.first_name} {member.last_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="service-hour-hours">Time (hours)</label>
                <input
                  id="service-hour-hours"
                  type="number"
                  step="0.1"
                  min="0"
                  value={hoursForm.hours}
                  onChange={(event) => setHoursForm({ ...hoursForm, hours: event.target.value })}
                  className={INPUT_CLASS}
                  required
                />
              </div>
              <div>
                <label htmlFor="service-hour-date">Date</label>
                <input
                  id="service-hour-date"
                  type="date"
                  value={hoursForm.service_date}
                  onChange={(event) =>
                    setHoursForm({ ...hoursForm, service_date: event.target.value })
                  }
                  className={INPUT_CLASS}
                  required
                />
              </div>
              <div>
                <label htmlFor="service-hour-rotary-year">Rotary year</label>
                <input
                  id="service-hour-rotary-year"
                  type="text"
                  readOnly
                  value={hoursFormRotaryYear === null ? "" : rotaryYearLabel(hoursFormRotaryYear)}
                  placeholder="Auto from date"
                  className={INPUT_CLASS}
                />
              </div>
              <div className="field-full">
                <label htmlFor="service-hour-notes">Notes</label>
                <input
                  id="service-hour-notes"
                  type="text"
                  value={hoursForm.notes}
                  onChange={(event) => setHoursForm({ ...hoursForm, notes: event.target.value })}
                  className={INPUT_CLASS}
                />
              </div>
              {hoursSaveError && <p role="alert">{hoursSaveError}</p>}
              <div className="modal-actions flex gap-3">
                <button type="submit" disabled={isSavingHours} className={SUBMIT_BUTTON_CLASS}>
                  {isSavingHours ? "Saving…" : editingHoursId ? "Update entry" : "Add services"}
                </button>
                {editingHoursId && (
                  <button type="button" onClick={resetHoursForm} className={CANCEL_BUTTON_CLASS}>
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </Card>
        </section>
      )}

      <section className="service-hours-history-section mt-6">
        <h3 className="text-[17px] font-bold text-[var(--color-brand-blue)]">
          Service hours history (past years)
        </h3>
        {pastServiceHours.length === 0 ? (
          <p className="member-empty-state">No historical service hours.</p>
        ) : (
          <EntryTable
            columns={["Rotary year", "Member", "Hours", "Date", "Notes"]}
            isAdmin={isAdmin}
            rows={pastServiceHours.map((entry) => renderHoursRow(entry, false))}
          />
        )}
      </section>
    </div>
  );
}
