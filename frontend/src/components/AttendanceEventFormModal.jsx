import { useState } from "react";
import { createAttendanceEvent, updateAttendanceEvent } from "../api/attendance";

export default function AttendanceEventFormModal({ event, onClose, onSaved }) {
  const isEditing = Boolean(event);
  const [form, setForm] = useState({
    name: event?.name || "",
    event_date: event?.event_date || "",
    event_type: event?.event_type || "dinner",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    try {
      const saved = isEditing
        ? await updateAttendanceEvent(event.id, form)
        : await createAttendanceEvent(form);
      onSaved(saved);
    } catch (err) {
      setSaveError(err.detail || "Failed to save event");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(event_) => event_.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <h2>{isEditing ? "Edit event" : "New event"}</h2>

          <div className="member-form-grid">
            <div className="field-full">
              <label htmlFor="attendance-event-name">Name</label>
              <input
                id="attendance-event-name"
                type="text"
                maxLength={120}
                value={form.name}
                onChange={(e2) => setForm({ ...form, name: e2.target.value })}
                required
              />
            </div>
            <div>
              <label htmlFor="attendance-event-date">Date</label>
              <input
                id="attendance-event-date"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={form.event_date}
                onChange={(e2) => setForm({ ...form, event_date: e2.target.value })}
                required
              />
            </div>
            <div>
              <label htmlFor="attendance-event-type">Type</label>
              <select
                id="attendance-event-type"
                value={form.event_type}
                onChange={(e2) => setForm({ ...form, event_type: e2.target.value })}
              >
                <option value="dinner">Dinner</option>
                <option value="fellowship">Fellowship</option>
              </select>
            </div>
          </div>

          {saveError && <p role="alert">{saveError}</p>}

          <div className="modal-actions">
            <button type="submit" disabled={isSaving}>
              {isSaving ? "Saving…" : isEditing ? "Save changes" : "Create event"}
            </button>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
