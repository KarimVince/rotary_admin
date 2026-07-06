import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createOrganisation,
  listOrganisations,
  updateOrganisation,
} from "../api/organisations";
import { COUNTRIES } from "../data/countries";
import { useAuth } from "../hooks/useAuth";

const EMPTY_FORM = {
  name: "",
  description: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  country: "",
  first_supported_year: "",
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

export default function OrganisationsList() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const navigate = useNavigate();

  const [organisations, setOrganisations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState("");

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  async function loadOrganisations() {
    setIsLoading(true);
    try {
      const data = await listOrganisations();
      setOrganisations(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.detail || "Failed to load organisations");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadOrganisations();
  }, []);

  const visibleOrganisations = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return organisations;
    return organisations.filter((org) => {
      const haystack = `${org.name} ${org.country ?? ""}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [organisations, search]);

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

  return (
    <div className="admin-page">
      <div className="page-header-row">
        <h1>NGOs &amp; Organisations</h1>
        {isAdmin && (
          <button type="button" className="btn-add-member" onClick={openAddModal}>
            + Add Organisation
          </button>
        )}
      </div>

      {isModalOpen && isAdmin && (
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
      </div>

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && visibleOrganisations.length === 0 && (
        <p className="member-empty-state">No organisations match your search.</p>
      )}

      {!isLoading && !loadError && visibleOrganisations.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Country</th>
              <th>Contact</th>
              <th>Since</th>
              {isAdmin && <th aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {visibleOrganisations.map((org) => (
              <tr
                key={org.id}
                className="data-row"
                onClick={() => navigate(`/ngos/${org.id}`)}
              >
                <td>{org.name}</td>
                <td>{org.country ?? "—"}</td>
                <td>{org.contact_name ?? "—"}</td>
                <td>{org.first_supported_year ?? "—"}</td>
                {isAdmin && (
                  <td>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        startEdit(org);
                      }}
                    >
                      Edit
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
