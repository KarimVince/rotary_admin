import { useState } from "react";
import { createEventItem, updateEventItem } from "../api/eventItems";

const TYPE_LABEL = {
  auction: "Auction",
  lucky_draw_on_stage: "Lucky Draw On Stage",
  lucky_draw: "Lucky Draw",
};

export default function EventItemFormModal({ eventId, item, members, onClose, onSaved }) {
  const isEditing = Boolean(item);
  const [form, setForm] = useState({
    name: item?.name || "",
    value_hkd: item?.value_hkd ?? "",
    donor_sponsor: item?.donor_sponsor || "",
    contact_rotary_id: item?.contact_rotary_id || "",
    item_type: item?.item_type || "auction",
    ad_page: item?.ad_page || false,
    status: item?.status || "not_received",
    value_sold: item?.value_sold ?? "",
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
        value_hkd: form.value_hkd === "" ? null : Number(form.value_hkd),
        donor_sponsor: form.donor_sponsor || null,
        contact_rotary_id: form.contact_rotary_id || null,
        value_sold:
          form.item_type === "auction" && form.value_sold !== "" ? Number(form.value_sold) : null,
      };
      const saved = isEditing
        ? await updateEventItem(eventId, item.id, payload)
        : await createEventItem(eventId, payload);
      onSaved(saved);
    } catch (err) {
      setSaveError(err.detail || "Failed to save item");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <h2>{isEditing ? "Edit item" : "New item"}</h2>

          <div className="member-form-grid">
            <div className="field-full">
              <label htmlFor="item-name">Name</label>
              <input
                id="item-name"
                type="text"
                maxLength={200}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label htmlFor="item-value-hkd">Value HKD</label>
              <input
                id="item-value-hkd"
                type="number"
                step="0.01"
                value={form.value_hkd}
                onChange={(e) => setForm({ ...form, value_hkd: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="item-donor-sponsor">Donor / Sponsor</label>
              <input
                id="item-donor-sponsor"
                type="text"
                maxLength={200}
                value={form.donor_sponsor}
                onChange={(e) => setForm({ ...form, donor_sponsor: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="item-contact-rotary">Contact Rotary</label>
              <select
                id="item-contact-rotary"
                value={form.contact_rotary_id}
                onChange={(e) => setForm({ ...form, contact_rotary_id: e.target.value })}
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
              <label htmlFor="item-type">Type</label>
              <select
                id="item-type"
                value={form.item_type}
                onChange={(e) => setForm({ ...form, item_type: e.target.value })}
              >
                {Object.entries(TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="item-status">Status</label>
              <select
                id="item-status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="not_received">Not Received</option>
                <option value="received">Received</option>
              </select>
            </div>
            <div>
              <label htmlFor="item-ad-page">Ad Page</label>
              <input
                id="item-ad-page"
                type="checkbox"
                checked={form.ad_page}
                onChange={(e) => setForm({ ...form, ad_page: e.target.checked })}
              />
            </div>
            {form.item_type === "auction" && (
              <div>
                <label htmlFor="item-value-sold">Value Sold</label>
                <input
                  id="item-value-sold"
                  type="number"
                  step="0.01"
                  value={form.value_sold}
                  onChange={(e) => setForm({ ...form, value_sold: e.target.value })}
                />
              </div>
            )}
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
