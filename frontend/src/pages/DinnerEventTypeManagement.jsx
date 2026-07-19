import { useEffect, useState } from "react";
import {
  createDinnerEventType,
  deleteDinnerEventType,
  listDinnerEventTypes,
  reorderDinnerEventTypes,
  updateDinnerEventType,
} from "../api/dinnerEventTypes";
import { useAccess } from "../hooks/useAccess";

const EMPTY_FORM = { name: "", color_bg: "", color_text: "" };

export default function DinnerEventTypeManagement() {
  const { canRead, canWrite } = useAccess("admin.dinner_event_types");
  const [types, setTypes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  async function loadTypes() {
    setIsLoading(true);
    try {
      const data = await listDinnerEventTypes();
      setTypes(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.detail || "Failed to load dinner event types");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    loadTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead]);

  function startEdit(type) {
    setEditingId(type.id);
    setForm({
      name: type.name,
      color_bg: type.color_bg ?? "",
      color_text: type.color_text ?? "",
    });
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
      const payload = {
        name: form.name,
        color_bg: form.color_bg || null,
        color_text: form.color_text || null,
      };
      if (editingId) {
        await updateDinnerEventType(editingId, payload);
      } else {
        await createDinnerEventType(payload);
      }
      cancelEdit();
      await loadTypes();
    } catch (err) {
      setSaveError(err.detail || "Failed to save event type");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(type) {
    if (type.event_count > 0) {
      window.alert(
        `"${type.name}" is used by ${type.event_count} dinner event${type.event_count === 1 ? "" : "s"} and cannot be deleted.`,
      );
      return;
    }
    if (!window.confirm(`Delete "${type.name}"?`)) return;
    try {
      await deleteDinnerEventType(type.id);
      await loadTypes();
    } catch (err) {
      window.alert(err.detail || "Failed to delete event type");
    }
  }

  // Same up/down reorder pattern as NgoClassificationManagement — no
  // drag-and-drop library installed anywhere in this app.
  async function handleMove(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= types.length) return;
    const reordered = [...types];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setTypes(reordered);
    await reorderDinnerEventTypes(
      reordered.map((type, sortOrder) => ({ id: type.id, sort_order: sortOrder })),
    );
    await loadTypes();
  }

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>Dinner Event Types</h1>
        <p role="alert">You do not have permission to view Dinner Event Types.</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <h1>Dinner Event Types</h1>

      {canWrite && (
        <form className="admin-form" onSubmit={handleSubmit}>
          <h2>{editingId ? "Edit event type" : "Add event type"}</h2>
          <label htmlFor="event-type-name">Name</label>
          <input
            id="event-type-name"
            type="text"
            maxLength={50}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
          />
          <label htmlFor="event-type-color-bg">Chip background (hex, optional)</label>
          <input
            id="event-type-color-bg"
            type="text"
            placeholder="#e3edfb"
            maxLength={20}
            value={form.color_bg}
            onChange={(event) => setForm({ ...form, color_bg: event.target.value })}
          />
          <label htmlFor="event-type-color-text">Chip text color (hex, optional)</label>
          <input
            id="event-type-color-text"
            type="text"
            placeholder="#17458f"
            maxLength={20}
            value={form.color_text}
            onChange={(event) => setForm({ ...form, color_text: event.target.value })}
          />
          {form.color_bg && form.color_text && (
            <span
              style={{
                background: form.color_bg,
                color: form.color_text,
                fontSize: "11px",
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: "999px",
                width: "fit-content",
              }}
            >
              {form.name || "Preview"}
            </span>
          )}
          {saveError && <p role="alert">{saveError}</p>}
          <button type="submit" disabled={isSaving}>
            {isSaving ? "Saving…" : editingId ? "Update event type" : "Add event type"}
          </button>
          {editingId && (
            <button type="button" onClick={cancelEdit}>
              Cancel
            </button>
          )}
        </form>
      )}

      <h2>Event Types</h2>
      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}
      {!isLoading && !loadError && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Name</th>
              <th>Preview</th>
              <th>Events</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {types.map((type, index) => (
              <tr key={type.id}>
                <td>
                  {canWrite && (
                    <>
                      <button
                        type="button"
                        aria-label={`Move ${type.name} up`}
                        disabled={index === 0}
                        onClick={() => handleMove(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${type.name} down`}
                        disabled={index === types.length - 1}
                        onClick={() => handleMove(index, 1)}
                      >
                        ↓
                      </button>
                    </>
                  )}
                </td>
                <td>{type.name}</td>
                <td>
                  {type.color_bg && type.color_text ? (
                    <span
                      style={{
                        background: type.color_bg,
                        color: type.color_text,
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "3px 10px",
                        borderRadius: "999px",
                      }}
                    >
                      {type.name}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{type.event_count}</td>
                <td>
                  {canWrite && (
                    <>
                      <button type="button" onClick={() => startEdit(type)}>
                        Edit
                      </button>
                      <button type="button" onClick={() => handleDelete(type)}>
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
