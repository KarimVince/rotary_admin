import { useEffect, useState } from "react";
import {
  createHonorific,
  deactivateHonorific,
  listHonorifics,
  updateHonorific,
} from "../api/honorifics";
import { useAccess } from "../hooks/useAccess";

const EMPTY_FORM = { code: "", label: "", sort_order: 0 };

export default function HonorificManagement() {
  const { canRead, canWrite } = useAccess("admin.honorifics");
  const [honorifics, setHonorifics] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  async function loadHonorifics() {
    setIsLoading(true);
    try {
      const data = await listHonorifics({ includeInactive: true });
      setHonorifics(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.detail || "Failed to load honorifics");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    loadHonorifics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead]);

  function startEdit(honorific) {
    setEditingId(honorific.id);
    setForm({ code: honorific.code, label: honorific.label, sort_order: honorific.sort_order });
    setSaveError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError(null);
    setIsSaving(true);

    try {
      const payload = { ...form, sort_order: Number(form.sort_order) };
      if (editingId) {
        await updateHonorific(editingId, payload);
      } else {
        await createHonorific(payload);
      }
      cancelEdit();
      await loadHonorifics();
    } catch (err) {
      setSaveError(err.detail || "Failed to save honorific");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive(honorific) {
    if (honorific.is_active) {
      await deactivateHonorific(honorific.id);
    } else {
      await updateHonorific(honorific.id, { is_active: true });
    }
    await loadHonorifics();
  }

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>Honorifics</h1>
        <p role="alert">You do not have permission to view Honorifics.</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <h1>Honorifics</h1>
      <p className="admin-page-note">
        Personal honorific titles (Mr., Mrs., Ms., Dr. etc.) offered on the member form —
        distinct from the Rotary role titles (P/PP/IPP/CP/Rtn) managed under Member Titles.
      </p>

      {canWrite && (
        <form className="admin-form" onSubmit={handleSubmit}>
          <h2>{editingId ? "Edit honorific" : "Add honorific"}</h2>
          <label htmlFor="honorific-code">Code</label>
          <input
            id="honorific-code"
            type="text"
            value={form.code}
            onChange={(event) => setForm({ ...form, code: event.target.value })}
            required
          />
          <label htmlFor="honorific-label">Label</label>
          <input
            id="honorific-label"
            type="text"
            value={form.label}
            onChange={(event) => setForm({ ...form, label: event.target.value })}
            required
          />
          <label htmlFor="honorific-sort-order">Sort order</label>
          <input
            id="honorific-sort-order"
            type="number"
            value={form.sort_order}
            onChange={(event) => setForm({ ...form, sort_order: event.target.value })}
          />
          {saveError && <p role="alert">{saveError}</p>}
          <button type="submit" disabled={isSaving}>
            {isSaving ? "Saving…" : editingId ? "Update honorific" : "Add honorific"}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit}>
              Cancel
            </button>
          )}
        </form>
      )}

      <h2>Honorifics</h2>
      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}
      {!isLoading && !loadError && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Label</th>
              <th>Sort order</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {honorifics.map((honorific) => (
              <tr key={honorific.id}>
                <td>{honorific.code}</td>
                <td>{honorific.label}</td>
                <td>{honorific.sort_order}</td>
                <td>{honorific.is_active ? "Active" : "Inactive"}</td>
                <td>
                  {canWrite && (
                    <button type="button" onClick={() => startEdit(honorific)}>
                      Edit
                    </button>
                  )}
                  {canWrite && (
                    <button type="button" onClick={() => handleToggleActive(honorific)}>
                      {honorific.is_active ? "Deactivate" : "Activate"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
