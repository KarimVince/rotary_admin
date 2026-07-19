import { useState } from "react";
import { createEvent, updateEvent } from "../api/events";
import { formatCurrency } from "../utils/formatters";

export default function EventFormModal({ event, members, onClose, onSaved }) {
  const isEditing = Boolean(event);
  const [form, setForm] = useState({
    name: event?.name || "",
    date: event?.date || "",
    hour: event?.hour || "",
    venue: event?.venue || "",
    oc_chair_member_id: event?.oc_chair_member_id || "",
    theme: event?.theme || "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    try {
      const payload = {
        ...form,
        hour: form.hour || null,
        oc_chair_member_id: form.oc_chair_member_id || null,
        theme: form.theme || null,
      };
      const saved = isEditing
        ? await updateEvent(event.id, payload)
        : await createEvent(payload);
      onSaved(saved);
    } catch (err) {
      setSaveError(err.detail || "Failed to save event");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <h2>{isEditing ? "Edit event" : "New event"}</h2>

          <div className="member-form-grid">
            <div className="field-full">
              <label htmlFor="event-name">Name</label>
              <input
                id="event-name"
                type="text"
                maxLength={200}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label htmlFor="event-date">Date</label>
              <input
                id="event-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </div>
            <div>
              <label htmlFor="event-hour">Hour</label>
              <input
                id="event-hour"
                type="time"
                value={form.hour}
                onChange={(e) => setForm({ ...form, hour: e.target.value })}
              />
            </div>
            <div className="field-full">
              <label htmlFor="event-venue">Venue</label>
              <input
                id="event-venue"
                type="text"
                maxLength={200}
                value={form.venue}
                onChange={(e) => setForm({ ...form, venue: e.target.value })}
                required
              />
            </div>
            <div>
              <label htmlFor="event-oc-chair">OC Chair</label>
              <select
                id="event-oc-chair"
                value={form.oc_chair_member_id}
                onChange={(e) => setForm({ ...form, oc_chair_member_id: e.target.value })}
              >
                <option value="">—</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.first_name} {member.last_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="event-theme">Theme</label>
              <input
                id="event-theme"
                type="text"
                maxLength={200}
                value={form.theme}
                onChange={(e) => setForm({ ...form, theme: e.target.value })}
              />
            </div>
            <div>
              {/* Story 14.2: read-only here, configured on the Setup page
                  (Story 14.3). */}
              <label htmlFor="event-ticket-price">Ticket price (normal)</label>
              <input
                id="event-ticket-price"
                type="text"
                readOnly
                disabled
                value={
                  event?.ticket_price_normal != null
                    ? formatCurrency(event.ticket_price_normal)
                    : "Not set — configure in Setup"
                }
              />
            </div>
          </div>

          {saveError && <p role="alert">{saveError}</p>}

          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
