import { Building2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_ORIGIN } from "../api/client";
import { listNgoClassifications } from "../api/ngoClassifications";
import {
  createOrganisation,
  listOrganisations,
  updateOrganisation,
  uploadOrganisationLogo,
} from "../api/organisations";
import Card from "../components/Card";
import { COUNTRIES } from "../data/countries";
import { SELECT_CLASS } from "../styles/formControls";
import { useAccess } from "../hooks/useAccess";
import { classificationColorClass } from "../utils/classificationColors";
import { currentRotaryYear, rotaryYearLabel } from "../utils/rotaryYear";

const YEAR_FILTER_OPTIONS = Array.from({ length: 5 }, (_, i) => currentRotaryYear() - i);

function formatHkd(value) {
  return `${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} HKD`;
}

const EMPTY_FORM = {
  name: "",
  description: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  country: "",
  first_supported_year: "",
  logo_url: "",
  classification_id: "",
};

function toPayload(form) {
  const payload = { ...form };
  Object.keys(payload).forEach((key) => {
    if (payload[key] === "") payload[key] = null;
  });
  if (payload.first_supported_year !== null) {
    payload.first_supported_year = Number(payload.first_supported_year);
  }
  return payload;
}

function resolveLogoUrl(logoUrl) {
  if (!logoUrl) return null;
  return /^https?:\/\//.test(logoUrl) ? logoUrl : `${API_ORIGIN}${logoUrl}`;
}

export default function OrganisationsList() {
  const { canRead, canWrite } = useAccess("ngos.organisations");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Defaults to "all" on first load (persisted in the URL so the filtered
  // view is bookmarkable/shareable); a specific year narrows it.
  const yearParam = searchParams.get("year");
  const yearFilter = !yearParam || yearParam === "all" ? null : Number(yearParam);

  useEffect(() => {
    if (yearParam === null) {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set("year", "all");
          return next;
        },
        { replace: true },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearParam]);

  function setYearFilter(value) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === null) next.set("year", "all");
        else next.set("year", String(value));
        return next;
      },
      { replace: false },
    );
  }

  // Story 11.5: classification filter, persisted in the URL the same way as
  // the year filter — absent/empty means "all classifications".
  const classificationFilter = searchParams.get("classification") || "";

  function setClassificationFilter(value) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set("classification", value);
      else next.delete("classification");
      return next;
    });
  }

  const [organisations, setOrganisations] = useState([]);
  const [classifications, setClassifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("");

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  useEffect(() => {
    // Non-fatal — the badges/filter just don't render if this fails.
    listNgoClassifications()
      .then(setClassifications)
      .catch(() => {});
  }, []);

  const classificationsById = useMemo(() => {
    const map = new Map();
    classifications.forEach((classification) => map.set(classification.id, classification));
    return map;
  }, [classifications]);

  async function loadOrganisations() {
    setIsLoading(true);
    try {
      const filters = {};
      if (yearFilter !== null) filters.rotary_year = yearFilter;
      if (classificationFilter) filters.classification_id = classificationFilter;
      const data = await listOrganisations(filters);
      setOrganisations(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.detail || "Failed to load organisations");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    loadOrganisations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead, yearFilter, classificationFilter]);

  const visibleOrganisations = useMemo(() => {
    const term = search.trim().toLowerCase();
    return organisations.filter((org) => {
      if (countryFilter && org.country !== countryFilter) return false;
      if (!term) return true;
      const haystack = `${org.name} ${org.country ?? ""}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [organisations, search, countryFilter]);

  const countryOptions = useMemo(
    () => [...new Set(organisations.map((org) => org.country).filter(Boolean))].sort(),
    [organisations],
  );

  function openAddModal() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
    setIsModalOpen(true);
  }

  function startEdit(org) {
    setEditingId(org.id);
    setForm({
      name: org.name ?? "",
      description: org.description ?? "",
      contact_name: org.contact_name ?? "",
      contact_email: org.contact_email ?? "",
      contact_phone: org.contact_phone ?? "",
      country: org.country ?? "",
      first_supported_year: org.first_supported_year ?? "",
      logo_url: org.logo_url ?? "",
      classification_id: org.classification_id ?? "",
    });
    setSaveError(null);
    setIsModalOpen(true);
  }

  function closeModal() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
    setIsModalOpen(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError(null);

    if (form.country && !COUNTRIES.includes(form.country)) {
      setSaveError("Country must be selected from the list of countries");
      return;
    }

    setIsSaving(true);
    try {
      const payload = toPayload(form);
      if (editingId) {
        await updateOrganisation(editingId, payload);
      } else {
        await createOrganisation(payload);
      }
      closeModal();
      await loadOrganisations();
    } catch (err) {
      setSaveError(err.detail || "Failed to save organisation");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLogoChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingLogo(true);
    setSaveError(null);
    try {
      const { logo_url } = await uploadOrganisationLogo(file);
      setForm((prev) => ({ ...prev, logo_url }));
    } catch (err) {
      setSaveError(err.detail || "Failed to upload logo");
    } finally {
      setIsUploadingLogo(false);
    }
  }

  function handleRemoveLogo() {
    if (!window.confirm("Remove this organisation's logo?")) return;
    setForm((prev) => ({ ...prev, logo_url: "" }));
  }

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>NGO &amp; Services Project</h1>
        <p role="alert">You do not have permission to view NGOs &amp; Organisations.</p>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page-wide">
      <div className="page-header-row">
        <h1>NGO &amp; Services Project</h1>
        {canWrite && (
          <button type="button" className="btn-add-member" onClick={openAddModal}>
            + Add Organisation
          </button>
        )}
      </div>

      {isModalOpen && canWrite && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-dialog" onClick={(event) => event.stopPropagation()}>
            <form onSubmit={handleSubmit}>
              <h2>{editingId ? "Edit organisation" : "Add organisation"}</h2>

              <div className="member-form-grid">
                <div className="field-full">
                  <label htmlFor="org-name">Name</label>
                  <input
                    id="org-name"
                    type="text"
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="org-country">Country</label>
                  <input
                    id="org-country"
                    type="text"
                    list="org-country-options"
                    autoComplete="off"
                    placeholder="Type to search…"
                    value={form.country}
                    onChange={(event) => setForm({ ...form, country: event.target.value })}
                  />
                  <datalist id="org-country-options">
                    {COUNTRIES.map((country) => (
                      <option key={country} value={country} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label htmlFor="org-classification">Classification</label>
                  <select
                    id="org-classification"
                    value={form.classification_id}
                    onChange={(event) =>
                      setForm({ ...form, classification_id: event.target.value })
                    }
                    className={SELECT_CLASS}
                  >
                    <option value="">— No classification —</option>
                    {classifications.map((classification) => (
                      <option key={classification.id} value={classification.id}>
                        {classification.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="org-first-year">First supported year</label>
                  <input
                    id="org-first-year"
                    type="number"
                    value={form.first_supported_year}
                    onChange={(event) =>
                      setForm({ ...form, first_supported_year: event.target.value })
                    }
                  />
                </div>
                <div>
                  <label htmlFor="org-contact-name">Contact name</label>
                  <input
                    id="org-contact-name"
                    type="text"
                    value={form.contact_name}
                    onChange={(event) => setForm({ ...form, contact_name: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="org-contact-email">Contact email</label>
                  <input
                    id="org-contact-email"
                    type="email"
                    value={form.contact_email}
                    onChange={(event) => setForm({ ...form, contact_email: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="org-contact-phone">Contact phone</label>
                  <input
                    id="org-contact-phone"
                    type="text"
                    value={form.contact_phone}
                    onChange={(event) => setForm({ ...form, contact_phone: event.target.value })}
                  />
                </div>
                <div className="field-full">
                  <label htmlFor="org-description">Description</label>
                  <input
                    id="org-description"
                    type="text"
                    value={form.description}
                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                  />
                </div>
                <div className="field-full">
                  <label htmlFor="org-logo-file">Logo</label>
                  <input
                    id="org-logo-file"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleLogoChange}
                    disabled={isUploadingLogo}
                  />
                  {isUploadingLogo && <span>Uploading…</span>}
                  {form.logo_url && !isUploadingLogo && (
                    <div className="org-logo-preview-row">
                      <img
                        className="org-detail-logo"
                        src={resolveLogoUrl(form.logo_url)}
                        alt="Preview"
                      />
                      <button type="button" onClick={handleRemoveLogo}>
                        Remove logo
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {saveError && <p role="alert">{saveError}</p>}
              <div className="modal-actions">
                <button type="submit" disabled={isSaving}>
                  {isSaving ? "Saving…" : editingId ? "Update organisation" : "Save organisation"}
                </button>
                <button type="button" onClick={closeModal}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="member-filter-bar">
        <input
          id="filter-search"
          className="member-filter-search"
          type="text"
          placeholder="Search by name or country…"
          aria-label="Search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          id="filter-country"
          aria-label="Country"
          value={countryFilter}
          onChange={(event) => setCountryFilter(event.target.value)}
          className={`${SELECT_CLASS} !w-auto min-w-[150px]`}
        >
          <option value="">All countries</option>
          {countryOptions.map((country) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
        </select>
        <select
          id="filter-rotary-year"
          aria-label="Rotary year"
          value={yearFilter === null ? "all" : String(yearFilter)}
          onChange={(event) =>
            setYearFilter(event.target.value === "all" ? null : Number(event.target.value))
          }
          className={`${SELECT_CLASS} !w-auto min-w-[130px]`}
        >
          <option value="all">All years</option>
          {YEAR_FILTER_OPTIONS.map((year) => (
            <option key={year} value={year}>
              {rotaryYearLabel(year)}
              {year === currentRotaryYear() ? " (current)" : ""}
            </option>
          ))}
        </select>
        {classifications.length > 0 && (
          <select
            id="filter-classification"
            aria-label="Classification"
            value={classificationFilter}
            onChange={(event) => setClassificationFilter(event.target.value)}
            className={`${SELECT_CLASS} !w-auto min-w-[150px]`}
          >
            <option value="">All classifications</option>
            {classifications.map((classification) => (
              <option key={classification.id} value={classification.id}>
                {classification.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && visibleOrganisations.length === 0 && (
        <p className="member-empty-state">
          {classificationFilter
            ? "No organisations match the selected classification."
            : yearFilter !== null
              ? `No organisations had donations in ${rotaryYearLabel(yearFilter)}.`
              : "No organisations match your search or filters."}
        </p>
      )}

      {!isLoading && !loadError && visibleOrganisations.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {visibleOrganisations.map((org) => (
            <Card
              key={org.id}
              variant="default"
              className="flex flex-col items-center text-center gap-1 cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => navigate(`/ngos/${org.id}`)}
            >
              {org.logo_url ? (
                <img className="org-detail-logo" src={resolveLogoUrl(org.logo_url)} alt="" />
              ) : (
                <div className="org-detail-logo org-detail-logo-fallback">
                  <Building2 className="w-8 h-8" aria-hidden="true" />
                </div>
              )}
              <div className="min-w-0 w-full">
                <span className="font-semibold text-[var(--color-brand-blue-dark)] truncate block">
                  {org.name}
                </span>
                <div className="text-sm text-gray-500 truncate">
                  {[org.country, org.contact_name].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <div className="text-xs text-gray-400">
                {org.first_supported_year ? `Supported since ${org.first_supported_year}` : "—"}
              </div>
              {org.classification_id && classificationsById.has(org.classification_id) && (
                <span
                  className={`inline-badge ${classificationColorClass(
                    classificationsById.get(org.classification_id).name,
                  )}`}
                >
                  {classificationsById.get(org.classification_id).name}
                </span>
              )}
              {yearFilter !== null && org.year_total !== null && org.year_total !== undefined && (
                <span className="inline-badge">
                  {formatHkd(org.year_total)} · {rotaryYearLabel(yearFilter)}
                </span>
              )}
              {canWrite && (
                <button
                  type="button"
                  className="mt-1 px-3 py-1 text-xs font-semibold cursor-pointer"
                  onClick={(event) => {
                    event.stopPropagation();
                    startEdit(org);
                  }}
                >
                  Edit
                </button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
