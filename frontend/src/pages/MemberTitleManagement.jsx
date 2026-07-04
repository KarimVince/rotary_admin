import { useEffect, useState } from "react";
import {
  createMemberTitle,
  deactivateMemberTitle,
  listMemberTitles,
  updateMemberTitle,
} from "../api/memberTitles";

const EMPTY_FORM = { code: "", label: "", sort_order: 0 };

export default function MemberTitleManagement() {
  const [titles, setTitles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  async function loadTitles() {
    setIsLoading(true);
    try {
      const data = await listMemberTitles({ includeInactive: true });
      setTitles(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.detail || "Failed to load titles");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadTitles();
  }, []);

  function startEdit(title) {
    setEditingId(title.id);
    setForm({ code: title.code, label: title.label, sort_order: title.sort_order });
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
        await updateMemberTitle(editingId, payload);
      } else {
        await createMemberTitle(payload);
      }
      cancelEdit();
      await loadTitles();
    } catch (err) {
      setSaveError(err.detail || "Failed to save title");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive(title) {
    if (title.is_active) {
      await deactivateMemberTitle(title.id);
    } else {
      await updateMemberTitle(title.id, { is_active: true });
    }
    await loadTitles();
  }

  return (
    <div className="admin-page">
      <h1>Member titles</h1>

      <form className="admin-form" onSubmit={handleSubmit}>
        <h2>{editingId ? "Edit title" : "Add title"}</h2>
        <label htmlFor="title-code">Code</label>
        <input
          id="title-code"
          type="text"
          value={form.code}
          onChange={(event) => setForm({ ...form, code: event.target.value })}
          required
        />
        <label htmlFor="title-label">Label</label>
        <input
          id="title-label"
          type="text"
          value={form.label}
          onChange={(event) => setForm({ ...form, label: event.target.value })}
          required
        />
        <label htmlFor="title-sort-order">Sort order</label>
        <input
          id="title-sort-order"
          type="number"
          value={form.sort_order}
          onChange={(event) => setForm({ ...form, sort_order: event.target.value })}
        />
        {saveError && <p role="alert">{saveError}</p>}
        <button type="submit" disabled={isSaving}>
          {isSaving ? "Saving…" : editingId ? "Update title" : "Add title"}
        </button>
        {editingId && (
          <button type="button" onClick={cancelEdit}>
            Cancel
          </button>
        )}
      </form>

      <h2>Titles</h2>
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
            {titles.map((title) => (
              <tr key={title.id}>
                <td>{title.code}</td>
                <td>{title.label}</td>
                <td>{title.sort_order}</td>
                <td>{title.is_active ? "Active" : "Inactive"}</td>
                <td>
                  <button type="button" onClick={() => startEdit(title)}>
                    Edit
                  </button>
                  <button type="button" onClick={() => handleToggleActive(title)}>
                    {title.is_active ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
