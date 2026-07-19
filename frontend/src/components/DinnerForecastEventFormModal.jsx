import { useState } from "react";
import { createDinnerForecastEvent, updateDinnerForecastEvent } from "../api/dinnerForecast";

export default function DinnerForecastEventFormModal({ event, members, eventTypes, onClose, onSaved }) {
  const isEditing = Boolean(event);
  const [form, setForm] = useState({
    name: event?.name || "",
    event_date: event?.event_date || "",
    event_type: event?.event_type || eventTypes[0]?.name || "",
    location: event?.location || "",
    speaker_name: event?.speaker_name || "",
    ngo_organisation_name: event?.ngo_organisation_name || "",
    speaker_rotary_contact_member_id: event?.speaker_rotary_contact_member_id || "",
    topics_description: event?.topics_description || "",
    member_only: event?.member_only || false,
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
        speaker_name: form.speaker_name || null,
        ngo_organisation_name: form.ngo_organisation_name || null,
        speaker_rotary_contact_member_id: form.speaker_rotary_contact_member_id || null,
        topics_description: form.topics_description || null,
      };
      const saved = isEditing
        ? await updateDinnerForecastEvent(event.id, payload)
        : await createDinnerForecastEvent(payload);
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
          <h2>{isEditing ? "Edit dinner event" : "New dinner event"}</h2>

          <div className="member-form-grid">
            <div className="field-full">
              <label htmlFor="forecast-event-name">Event name</label>
              <input
                id="forecast-event-name"
                type="text"
                maxLength={120}
                value={form.name}
                onChange={(e2) => setForm({ ...form, name: e2.target.value })}
                required
              />
            </div>
            <div>
              <label htmlFor="forecast-event-date">Date</label>
              <input
                id="forecast-event-date"
                type="date"
                value={form.event_date}
                onChange={(e2) => setForm({ ...form, event_date: e2.target.value })}
                required
              />
            </div>
            <div>
              <label htmlFor="forecast-event-type">Type</label>
              <select
                id="forecast-event-type"
                value={form.event_type}
                onChange={(e2) => setForm({ ...form, event_type: e2.target.value })}
              >
                {eventTypes.map((type) => (
                  <option key={type.id} value={type.name}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-full">
              <label htmlFor="forecast-event-location">Location</label>
              <input
                id="forecast-event-location"
                type="text"
                maxLength={200}
                value={form.location}
                onChange={(e2) => setForm({ ...form, location: e2.target.value })}
                required
              />
            </div>
            <div>
              <label htmlFor="forecast-event-speaker">Speaker name</label>
              <input
                id="forecast-event-speaker"
                type="text"
                maxLength={200}
                value={form.speaker_name}
                onChange={(e2) => setForm({ ...form, speaker_name: e2.target.value })}
              />
            </div>
            <div>
              <label htmlFor="forecast-event-ngo">NGO / Organisation</label>
              <input
                id="forecast-event-ngo"
                type="text"
                maxLength={255}
                value={form.ngo_organisation_name}
                onChange={(e2) => setForm({ ...form, ngo_organisation_name: e2.target.value })}
              />
            </div>
            <div>
              <label htmlFor="forecast-event-speaker-contact">Speaker Rotary contact</label>
              <select
                id="forecast-event-speaker-contact"
                value={form.speaker_rotary_contact_member_id}
                onChange={(e2) =>
                  setForm({ ...form, speaker_rotary_contact_member_id: e2.target.value })
                }
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
              <label htmlFor="forecast-event-member-only">Member Only</label>
              <input
                id="forecast-event-member-only"
                type="checkbox"
                checked={form.member_only}
                onChange={(e2) => setForm({ ...form, member_only: e2.target.checked })}
              />
            </div>
            <div className="field-full">
              <label htmlFor="forecast-event-topics">Topics / Description</label>
              <textarea
                id="forecast-event-topics"
                rows={8}
                value={form.topics_description}
                onChange={(e2) => setForm({ ...form, topics_description: e2.target.value })}
              />
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
