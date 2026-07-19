import { useState } from "react";
import { createEventGuest, updateEventGuest } from "../api/eventGuests";

export default function EventGuestFormModal({ eventId, guest, members, tableMapping, onClose, onSaved }) {
  const isEditing = Boolean(guest);
  const [form, setForm] = useState({
    title: guest?.title || "",
    surname: guest?.surname || "",
    first_name: guest?.first_name || "",
    contact_rotarian_id: guest?.contact_rotarian_id || "",
    payment_status: guest?.payment_status || "not_paid",
    early_bird: guest?.early_bird || false,
    table_number: guest?.table_number ?? "",
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
        title: form.title || null,
        contact_rotarian_id: form.contact_rotarian_id || null,
        table_number: form.table_number === "" ? null : Number(form.table_number),
      };
      const saved = isEditing
        ? await updateEventGuest(eventId, guest.id, payload)
        : await createEventGuest(eventId, payload);
      onSaved(saved);
    } catch (err) {
      setSaveError(err.detail || "Failed to save guest");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <h2>{isEditing ? "Edit guest" : "New guest"}</h2>

          <div className="member-form-grid">
            <div>
              <label htmlFor="guest-title">Title</label>
              <input
                id="guest-title"
                type="text"
                maxLength={20}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="guest-surname">Surname</label>
              <input
                id="guest-surname"
                type="text"
                maxLength={100}
                value={form.surname}
                onChange={(e) => setForm({ ...form, surname: e.target.value })}
                required
              />
            </div>
            <div>
              <label htmlFor="guest-first-name">First Name</label>
              <input
                id="guest-first-name"
                type="text"
                maxLength={100}
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                required
              />
            </div>
            <div>
              <label htmlFor="guest-contact-rotarian">Contact Rotarian</label>
              <select
                id="guest-contact-rotarian"
                value={form.contact_rotarian_id}
                onChange={(e) => setForm({ ...form, contact_rotarian_id: e.target.value })}
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
              <label htmlFor="guest-payment-status">Payment Status</label>
              <select
                id="guest-payment-status"
                value={form.payment_status}
                onChange={(e) => setForm({ ...form, payment_status: e.target.value })}
              >
                <option value="paid">Paid</option>
                <option value="not_paid">Not Paid</option>
                <option value="guest">Guest</option>
              </select>
            </div>
            <div>
              <label htmlFor="guest-early-bird">Early Bird</label>
              <input
                id="guest-early-bird"
                type="checkbox"
                checked={form.early_bird}
                onChange={(e) => setForm({ ...form, early_bird: e.target.checked })}
              />
            </div>
            <div>
              <label htmlFor="guest-table-number">Table Number</label>
              <select
                id="guest-table-number"
                value={form.table_number}
                onChange={(e) => setForm({ ...form, table_number: e.target.value })}
              >
                <option value="">—</option>
                {tableMapping.map((table) => (
                  <option key={table.id} value={table.table_number}>
                    {table.table_number}
                    {table.theme_name ? ` — ${table.theme_name}` : ""}
                  </option>
                ))}
              </select>
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
