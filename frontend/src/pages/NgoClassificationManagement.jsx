import { useEffect, useState } from "react";
import {
  createNgoClassification,
  deleteNgoClassification,
  listNgoClassifications,
  reorderNgoClassifications,
  updateNgoClassification,
} from "../api/ngoClassifications";
import { useAccess } from "../hooks/useAccess";

const EMPTY_FORM = { name: "", description: "" };

export default function NgoClassificationManagement() {
  const { canRead, canWrite } = useAccess("admin.ngo_classifications");
  const [classifications, setClassifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  async function loadClassifications() {
    setIsLoading(true);
    try {
      const data = await listNgoClassifications();
      setClassifications(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.detail || "Failed to load classifications");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    loadClassifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead]);

  function startEdit(classification) {
    setEditingId(classification.id);
    setForm({ name: classification.name, description: classification.description ?? "" });
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
      const payload = { name: form.name, description: form.description || null };
      if (editingId) {
        await updateNgoClassification(editingId, payload);
      } else {
        await createNgoClassification(payload);
      }
      cancelEdit();
      await loadClassifications();
    } catch (err) {
      setSaveError(err.detail || "Failed to save classification");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(classification) {
    const warning =
      classification.organisation_count > 0
        ? `${classification.organisation_count} NGO${classification.organisation_count === 1 ? "" : "s"} will become unclassified. `
        : "";
    if (!window.confirm(`${warning}Delete "${classification.name}"?`)) return;
    await deleteNgoClassification(classification.id);
    await loadClassifications();
  }

  // Story 11.2 calls for drag-and-drop reorder; this app has no drag-and-drop
  // library installed anywhere, so — consistent with how every other
  // reorderable list in this codebase (member_titles.sort_order,
  // board_positions.display_order) is edited — reordering here is done via
  // up/down buttons that persist through the same reorder endpoint a
  // drag-and-drop UI would call.
  async function handleMove(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= classifications.length) return;
    const reordered = [...classifications];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setClassifications(reordered);
    await reorderNgoClassifications(
      reordered.map((classification, position) => ({ id: classification.id, position })),
    );
    await loadClassifications();
  }

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>NGO Classifications</h1>
        <p role="alert">You do not have permission to view NGO Classifications.</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <h1>NGO Classifications</h1>

      {canWrite && (
        <form className="admin-form" onSubmit={handleSubmit}>
          <h2>{editingId ? "Edit classification" : "Add classification"}</h2>
          <label htmlFor="classification-name">Name</label>
          <input
            id="classification-name"
            type="text"
            maxLength={100}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
          />
          <label htmlFor="classification-description">Description</label>
          <textarea
            id="classification-description"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
          {saveError && <p role="alert">{saveError}</p>}
          <button type="submit" disabled={isSaving}>
            {isSaving ? "Saving…" : editingId ? "Update classification" : "Add classification"}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit}>
              Cancel
            </button>
          )}
        </form>
      )}

      <h2>Classifications</h2>
      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}
      {!isLoading && !loadError && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Name</th>
              <th>NGO count</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {classifications.map((classification, index) => (
              <tr key={classification.id}>
                <td>
                  {canWrite && (
                    <>
                      <button
                        type="button"
                        aria-label={`Move ${classification.name} up`}
                        disabled={index === 0}
                        onClick={() => handleMove(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${classification.name} down`}
                        disabled={index === classifications.length - 1}
                        onClick={() => handleMove(index, 1)}
                      >
                        ↓
                      </button>
                    </>
                  )}
                </td>
                <td>{classification.name}</td>
                <td>{classification.organisation_count}</td>
                <td>
                  {canWrite && (
                    <>
                      <button type="button" onClick={() => startEdit(classification)}>
                        Edit
                      </button>
                      <button type="button" onClick={() => handleDelete(classification)}>
                        Delete
                      </button>
                    </>
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
