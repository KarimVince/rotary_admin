import { Building2, Calendar } from "lucide-react";
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
import SingleSelectDropdown from "../components/SingleSelectDropdown";
import { useAccess } from "../hooks/useAccess";
import { useRotaryYears } from "../hooks/useRotaryYears";
import { SELECT_CLASS, INPUT_CLASS } from "../styles/formControls";
import { classificationColorClass } from "../utils/classificationColors";
import { currentRotaryYear, rotaryYear, rotaryYearLabel } from "../utils/rotaryYear";
import { CURRENCIES, currencyLabel } from "../data/currencies";

// Story 16.23: table/button styling shared by every table on this page —
// same Card-wrapped, uppercase-header, text-link-action pattern as
// EmailLogTable.jsx / MemberFees.jsx, the design baseline this story asked
// for, instead of the page's old plain `.data-table` CSS class.

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

// Story 16.35: `planned` + `rotary_year` added — a planned donation has no
// donation_date yet, so its rotary_year can't be derived from one and is
// picked directly instead (see the form's Rotary year select, only shown
// while Planned is checked).
const EMPTY_FORM = {
  amount: "",
  donation_date: "",
  currency: "HKD",
  notes: "",
  planned: false,
  rotary_year: "",
};
// Story 16.14 / planned services: parallel to EMPTY_FORM for donations.
// `planned` + `rotary_year` work the same way — a planned service has no
// date or member yet; the rotary year is picked directly from a select.
const EMPTY_SERVICE_HOUR_FORM = {
  member_id: "",
  hours: "",
  service_date: "",
  notes: "",
  planned: false,
  rotary_year: "",
};

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
  // Story 16.35: central Rotary Years list, reused for the donation year
  // filter's options and the planned-donation form's Rotary year select
  // (same source every other year selector in the app uses).
  const { yearOptions: allRotaryYearOptions, currentYear: centralCurrentYear } = useRotaryYears();

  const ACTION_BUTTON_CLASS =
    "bg-transparent border-none p-0 mr-4 text-[13px] font-semibold text-[var(--accent)] hover:text-[var(--accent-ink)] cursor-pointer";
  const DELETE_BUTTON_CLASS =
    "bg-transparent border-none p-0 text-[13px] font-semibold text-[var(--low)] hover:opacity-80 cursor-pointer";
  const SUBMIT_BUTTON_CLASS =
    "rounded-lg px-4 py-2 text-[13.5px] font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-ink)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border-none";
  const CANCEL_BUTTON_CLASS =
    "rounded-lg px-4 py-2 text-[13.5px] font-semibold text-[var(--ink-2)] bg-transparent border border-[var(--border)] hover:bg-[var(--bg-alt)] cursor-pointer";

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

  // Story 16.35: "all" (default) or a specific rotary year — replaces the
  // old always-both "current year / past years" split with a proper filter,
  // matching the story's "All years" vs "a specific year" list-view spec.
  const [donationYearFilter, setDonationYearFilter] = useState("all");

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

  // Story 16.35: while Planned, the rotary year comes straight from the
  // form's own select (no date to derive it from); otherwise unchanged.
  const formRotaryYear = useMemo(
    () => (form.planned ? (form.rotary_year === "" ? null : Number(form.rotary_year)) : rotaryYear(form.donation_date)),
    [form.planned, form.rotary_year, form.donation_date],
  );
  // For planned service entries the year comes from the form's own select;
  // for actual entries it is derived from service_date (same as donations).
  const hoursFormRotaryYear = useMemo(
    () =>
      hoursForm.planned
        ? hoursForm.rotary_year === "" ? null : Number(hoursForm.rotary_year)
        : rotaryYear(hoursForm.service_date),
    [hoursForm.planned, hoursForm.rotary_year, hoursForm.service_date],
  );

  // Story 16.35: totals only ever count actual (non-planned) donations —
  // a planned/forecast amount must never be conflated into "total donated".
  const totalsByCurrency = useMemo(() => {
    const totals = {};
    donations
      .filter((donation) => !donation.planned)
      .forEach((donation) => {
        totals[donation.currency] = (totals[donation.currency] ?? 0) + Number(donation.amount);
      });
    return totals;
  }, [donations]);

  // Story 16.35: every rotary year that has at least one donation (plus the
  // current year, always offered even with none yet) — options for the
  // donation list's year filter.
  const donationYearOptions = useMemo(() => {
    const years = new Set(donations.map((donation) => donation.rotary_year));
    years.add(thisRotaryYear);
    return Array.from(years).sort((a, b) => b - a);
  }, [donations, thisRotaryYear]);

  const filteredDonations = useMemo(() => {
    const rows =
      donationYearFilter === "all"
        ? donations
        : donations.filter((donation) => donation.rotary_year === Number(donationYearFilter));
    // Newest first; a planned donation (no date) sorts after actual ones in
    // the same year.
    return [...rows].sort((a, b) => {
      if (a.rotary_year !== b.rotary_year) return b.rotary_year - a.rotary_year;
      if (!a.donation_date && !b.donation_date) return 0;
      if (!a.donation_date) return 1;
      if (!b.donation_date) return -1;
      return a.donation_date < b.donation_date ? 1 : -1;
    });
  }, [donations, donationYearFilter]);

  // Service hours year filter — mirrors the donation year filter so the user
  // can browse a specific year's planned + actual service hours at a glance.
  const [serviceYearFilter, setServiceYearFilter] = useState("all");

  const serviceYearOptions = useMemo(() => {
    const years = new Set(serviceHours.map((entry) => entry.rotary_year));
    years.add(thisRotaryYear);
    return Array.from(years).sort((a, b) => b - a);
  }, [serviceHours, thisRotaryYear]);

  const filteredServiceHours = useMemo(() => {
    const rows =
      serviceYearFilter === "all"
        ? serviceHours
        : serviceHours.filter((entry) => entry.rotary_year === Number(serviceYearFilter));
    // Newest first; planned entries (no date) sort after actual ones in the
    // same year, mirroring the donation sort order.
    return [...rows].sort((a, b) => {
      if (a.rotary_year !== b.rotary_year) return b.rotary_year - a.rotary_year;
      if (!a.service_date && !b.service_date) return 0;
      if (!a.service_date) return 1;
      if (!b.service_date) return -1;
      return a.service_date < b.service_date ? 1 : -1;
    });
  }, [serviceHours, serviceYearFilter]);

  const { totalHours, totalHoursCurrentYear } =
    useMemo(() => {
      let allTimeTotal = 0;
      let currentYearTotal = 0;
      serviceHours.forEach((entry) => {
        // All-time total counts only actual (delivered) hours.
        if (!entry.planned) allTimeTotal += Number(entry.hours);
        if (entry.rotary_year === thisRotaryYear && !entry.planned) {
          currentYearTotal += Number(entry.hours);
        }
      });
      return { totalHours: allTimeTotal, totalHoursCurrentYear: currentYearTotal };
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
      donation_date: donation.donation_date ?? "",
      currency: donation.currency,
      notes: donation.notes ?? "",
      planned: donation.planned,
      rotary_year: String(donation.rotary_year),
    });
    setSaveError(null);
  }

  // Story 16.35: converting a planned donation to actual is the same edit
  // form — pre-fills today's date and unchecks Planned, so Save just does
  // the in-place conversion (no new record, no separate flow).
  function startConvert(donation) {
    setEditingId(donation.id);
    setForm({
      amount: String(donation.amount),
      donation_date: new Date().toISOString().slice(0, 10),
      currency: donation.currency,
      notes: donation.notes ?? "",
      planned: false,
      rotary_year: String(donation.rotary_year),
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
        currency: form.currency || "HKD",
        notes: form.notes === "" ? null : form.notes,
        planned: form.planned,
        ...(form.planned
          ? { donation_date: null, rotary_year: Number(form.rotary_year) }
          : { donation_date: form.donation_date }),
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
      member_id: entry.member_id ?? "",
      hours: String(entry.hours),
      service_date: entry.service_date ?? "",
      notes: entry.notes ?? "",
      planned: entry.planned,
      rotary_year: String(entry.rotary_year),
    });
    setHoursSaveError(null);
  }

  // Converting a planned service to actual: pre-fill today's date, clear the
  // Planned flag, keep everything else — same pattern as donation conversion.
  function startConvertHours(entry) {
    setEditingHoursId(entry.id);
    setHoursForm({
      member_id: entry.member_id ?? "",
      hours: String(entry.hours),
      service_date: new Date().toISOString().slice(0, 10),
      notes: entry.notes ?? "",
      planned: false,
      rotary_year: String(entry.rotary_year),
    });
    setHoursSaveError(null);
  }

  async function handleHoursSubmit(event) {
    event.preventDefault();
    setHoursSaveError(null);
    setIsSavingHours(true);
    try {
      const payload = {
        hours: Number(hoursForm.hours),
        notes: hoursForm.notes === "" ? null : hoursForm.notes,
        planned: hoursForm.planned,
        ...(hoursForm.planned
          ? {
              service_date: null,
              rotary_year: Number(hoursForm.rotary_year),
              member_id: hoursForm.member_id || null,
            }
          : {
              service_date: hoursForm.service_date,
              member_id: hoursForm.member_id || null,
            }),
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
  const CELL_STRONG_CLASS = "px-5 py-[14px] text-[14px] font-semibold text-[var(--text-h)]";

  function renderHoursRow(entry, highlight, showYearColumn) {
    return (
      <tr
        key={entry.id}
        className={`border-b border-[var(--color-border-light)] last:border-b-0 ${highlight ? "service-hour-row-current" : ""}`}
      >
        {showYearColumn && (
          <td className={CELL_CLASS}>{rotaryYearLabel(entry.rotary_year)}</td>
        )}
        <td
          className={`px-5 py-[14px] text-[14px] font-semibold ${
            entry.planned ? "donation-amount-planned" : "donation-amount-actual"
          }`}
        >
          {formatHours(entry.hours)}
          {entry.planned && <span className="donation-planned-badge">Planned</span>}
        </td>
        <td className={CELL_CLASS}>{entry.member_name ?? "—"}</td>
        <td className={CELL_CLASS}>{entry.service_date ?? "—"}</td>
        <td className={CELL_CLASS}>{entry.notes ?? "—"}</td>
        {isAdmin && (
          <td className="px-5 py-[14px] text-right whitespace-nowrap">
            {entry.planned && (
              <button
                type="button"
                onClick={() => startConvertHours(entry)}
                className={ACTION_BUTTON_CLASS}
              >
                Mark as delivered
              </button>
            )}
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

  // Story 16.35: planned donations render in purple, actual (already-made)
  // donations in blue — applied to the amount cell rather than the whole
  // row, so the existing amber "this rotary year" row highlight still shows
  // through underneath.
  function renderRow(donation, highlight, showYearColumn) {
    return (
      <tr
        key={donation.id}
        className={`border-b border-[var(--color-border-light)] last:border-b-0 ${highlight ? "donation-row-current" : ""}`}
      >
        {showYearColumn && (
          <td className={CELL_CLASS}>{rotaryYearLabel(donation.rotary_year)}</td>
        )}
        <td
          className={`px-5 py-[14px] text-[14px] font-semibold ${
            donation.planned ? "donation-amount-planned" : "donation-amount-actual"
          }`}
        >
          {formatAmount(donation.amount, donation.currency)}
          {donation.planned && <span className="donation-planned-badge">Planned</span>}
        </td>
        <td className={CELL_CLASS}>{donation.donation_date ?? "—"}</td>
        <td className={CELL_CLASS}>{donation.notes ?? "—"}</td>
        {isAdmin && (
          <td className="px-5 py-[14px] text-right whitespace-nowrap">
            {donation.planned && (
              <button
                type="button"
                onClick={() => startConvert(donation)}
                className={ACTION_BUTTON_CLASS}
              >
                Mark as received
              </button>
            )}
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
      <Link to="/ngos" className="text-[13px] font-semibold text-[var(--accent)] hover:text-[var(--accent-ink)]">
        ← Back to organisations
      </Link>
      <div className="org-detail-header mt-3">
        <div className="ngo-avatar">
          {organisation.logo_url ? (
            <img src={resolveLogoUrl(organisation.logo_url)} alt="" />
          ) : (
            <Building2 className="w-6 h-6" aria-hidden="true" />
          )}
        </div>
        <h1 className="text-[22px] font-bold text-[var(--ink)]">{organisation.name}</h1>
        {organisation.classification_id && classificationsById.has(organisation.classification_id) && (
          <span
            className={`ngo-pill ${classificationColorClass(
              classificationsById.get(organisation.classification_id).name,
            )}`}
          >
            {classificationsById.get(organisation.classification_id).name}
          </span>
        )}
      </div>
      <div className="org-detail-meta text-[13.5px] text-[var(--ink-2)] leading-relaxed">
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
          module's stat cards. STEP-7: Minimal renders the same computed
          values as a value/label stat card (`.stat-duo-grid` gives the
          accent/gold alternation for free); Classic keeps its own
          single-paragraph card untouched. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 max-w-[700px] stat-duo-grid">
        <Card variant="stat-blue" className="flex flex-col">
          <span className="text-3xl font-bold">
            {Object.keys(totalsByCurrency).length === 0
              ? formatAmount(0, "HKD")
              : Object.entries(totalsByCurrency)
                  .map(([currency, sum]) => formatAmount(sum, currency))
                  .join(", ")}
          </span>
          <span className="mt-2 text-sm">Total donated (all years)</span>
        </Card>
        <Card variant="stat-teal" className="flex flex-col">
          <span className="text-3xl font-bold">{formatHours(totalHours)}</span>
          <span className="mt-2 text-sm">
            Total service hours (all years) — Current year ({rotaryYearLabel(thisRotaryYear)}):{" "}
            {formatHours(totalHoursCurrentYear)}
          </span>
        </Card>
      </div>

      <section className="donation-current-section">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="seclabel !mt-0">Donations</h2>
          <div className="flex flex-col gap-1.5 mb-2">
            <span className="pl-0.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]">
              Rotary year
            </span>
            <SingleSelectDropdown
              icon={Calendar}
              ariaLabel="Filter donations by rotary year"
              minWidthClass="min-w-[170px]"
              value={String(donationYearFilter)}
              options={[
                { value: "all", label: "All years" },
                ...donationYearOptions.map((year) => ({
                  value: String(year),
                  label: `${rotaryYearLabel(year)}${year === thisRotaryYear ? " (current)" : ""}`,
                })),
              ]}
              onSelect={setDonationYearFilter}
            />
          </div>
        </div>
        {/* Story 16.35: purple = planned, blue = actual. When "All years" is
            selected the Rotary year column stays so forecast-vs-actuals can
            be told apart across years at a glance; a specific year drops it
            since the filter already implies it. */}
        {filteredDonations.length === 0 ? (
          <p className="member-empty-state">No donations recorded for this selection yet.</p>
        ) : (
          <EntryTable
            columns={
              donationYearFilter === "all"
                ? ["Rotary year", "Amount", "Date", "Notes"]
                : ["Amount", "Date", "Notes"]
            }
            isAdmin={isAdmin}
            rows={filteredDonations.map((donation) =>
              renderRow(donation, donation.rotary_year === thisRotaryYear, donationYearFilter === "all"),
            )}
          />
        )}
      </section>

      {isAdmin && (
        <section className="donation-form-section mt-6">
          <h2 className="seclabel !mt-0">
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
              {/* Story 16.35: Planned toggles which of Date / Rotary year is
                  the real input — a planned donation is scoped by rotary
                  year only (no date yet); an actual one keeps the existing
                  date-driven behavior unchanged. */}
              <div className="field-full flex items-center gap-2">
                <input
                  id="donation-planned"
                  type="checkbox"
                  checked={form.planned}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      planned: event.target.checked,
                      rotary_year: event.target.checked
                        ? form.rotary_year || String(centralCurrentYear ?? thisRotaryYear)
                        : form.rotary_year,
                    })
                  }
                />
                <label htmlFor="donation-planned" className="!mb-0">
                  Planned donation (not yet made — target/forecast for a rotary year)
                </label>
              </div>
              {form.planned ? (
                <div>
                  <label htmlFor="donation-rotary-year-select">Rotary year</label>
                  <select
                    id="donation-rotary-year-select"
                    value={form.rotary_year}
                    onChange={(event) => setForm({ ...form, rotary_year: event.target.value })}
                    className={SELECT_CLASS}
                    required
                  >
                    {allRotaryYearOptions.map((year) => (
                      <option key={year} value={year}>
                        {rotaryYearLabel(year)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
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
                </>
              )}
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


      <section className="service-hours-current-section">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="seclabel !mt-0">Services</h2>
          <div className="flex flex-col gap-1.5 mb-2">
            <span className="pl-0.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]">
              Rotary year
            </span>
            <SingleSelectDropdown
              icon={Calendar}
              ariaLabel="Filter service hours by rotary year"
              minWidthClass="min-w-[170px]"
              value={String(serviceYearFilter)}
              options={[
                { value: "all", label: "All years" },
                ...serviceYearOptions.map((year) => ({
                  value: String(year),
                  label: `${rotaryYearLabel(year)}${year === thisRotaryYear ? " (current)" : ""}`,
                })),
              ]}
              onSelect={setServiceYearFilter}
            />
          </div>
        </div>
        {filteredServiceHours.length === 0 ? (
          <p className="member-empty-state">No service hours recorded for this selection yet.</p>
        ) : (
          <EntryTable
            columns={
              serviceYearFilter === "all"
                ? ["Rotary year", "Hours", "Member", "Date", "Notes"]
                : ["Hours", "Member", "Date", "Notes"]
            }
            isAdmin={isAdmin}
            rows={filteredServiceHours.map((entry) =>
              renderHoursRow(entry, entry.rotary_year === thisRotaryYear, serviceYearFilter === "all"),
            )}
          />
        )}
      </section>

      {isAdmin && (
        <section className="service-hours-form-section mt-6">
          <h2 className="seclabel !mt-0">
            {editingHoursId ? "Edit service hours" : "Add services"}
          </h2>
          <Card variant="default" className="!p-5 !rounded-2xl max-w-[700px]">
            <form onSubmit={handleHoursSubmit} className="donation-form">
              {/* Planned toggle — same pattern as donation Planned checkbox */}
              <div className="field-full flex items-center gap-2">
                <input
                  id="service-hour-planned"
                  type="checkbox"
                  checked={hoursForm.planned}
                  onChange={(event) =>
                    setHoursForm({
                      ...hoursForm,
                      planned: event.target.checked,
                      rotary_year: event.target.checked
                        ? hoursForm.rotary_year || String(centralCurrentYear ?? thisRotaryYear)
                        : hoursForm.rotary_year,
                    })
                  }
                />
                <label htmlFor="service-hour-planned" className="!mb-0">
                  Planned service (not yet delivered — forecast for a rotary year)
                </label>
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

              {/* Member: optional for planned, required for actual */}
              <div>
                <label htmlFor="service-hour-member">
                  Member name{hoursForm.planned ? " (optional)" : ""}
                </label>
                <select
                  id="service-hour-member"
                  value={hoursForm.member_id}
                  onChange={(event) => setHoursForm({ ...hoursForm, member_id: event.target.value })}
                  className={SELECT_CLASS}
                  required={!hoursForm.planned}
                >
                  <option value="">
                    {hoursForm.planned ? "— Not yet assigned —" : "Select a member"}
                  </option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.first_name} {member.last_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date / Rotary year — mirrors the donation form's planned toggle */}
              {hoursForm.planned ? (
                <div>
                  <label htmlFor="service-hour-rotary-year-select">Rotary year</label>
                  <select
                    id="service-hour-rotary-year-select"
                    value={hoursForm.rotary_year}
                    onChange={(event) => setHoursForm({ ...hoursForm, rotary_year: event.target.value })}
                    className={SELECT_CLASS}
                    required
                  >
                    {allRotaryYearOptions.map((year) => (
                      <option key={year} value={year}>
                        {rotaryYearLabel(year)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
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
                </>
              )}

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
    </div>
  );
}
