import { useState } from "react";
import { formatCurrency } from "../utils/formatters";

// Shared by Operational Cost (Story 14.8) and Sponsor (Story 14.9) pages —
// identical add/edit form shape (name, category, quantity, unit price,
// computed total), parameterized by which create/update function to call.
export default function EventCategoryEntryFormModal({
  entry,
  categories,
  totalFieldLabel,
  createFn,
  updateFn,
  onClose,
  onSaved,
}) {
  const isEditing = Boolean(entry);
  const [form, setForm] = useState({
    name: entry?.name || "",
    category: entry?.category || "",
    quantity: entry?.quantity ?? 1,
    unit_price: entry?.unit_price ?? "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const quantity = Number(form.quantity) || 0;
  const unitPrice = Number(form.unit_price) || 0;
  const total = quantity * unitPrice;

  async function handleSubmit(e) {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    try {
      const payload = {
        name: form.name,
        category: form.category || null,
        quantity,
        unit_price: unitPrice,
      };
      const saved = isEditing ? await updateFn(entry.id, payload) : await createFn(payload);
      onSaved(saved);
    } catch (err) {
      setSaveError(err.detail || "Failed to save");
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
              <label htmlFor="category-entry-name">Name</label>
              <input
                id="category-entry-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label htmlFor="category-entry-category">Category</label>
              <select
                id="category-entry-category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option value="">—</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.name}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="category-entry-quantity">Quantity</label>
              <input
                id="category-entry-quantity"
                type="number"
                step="0.01"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                required
              />
            </div>
            <div>
              <label htmlFor="category-entry-unit-price">Unit Price</label>
              <input
                id="category-entry-unit-price"
                type="number"
                step="0.01"
                value={form.unit_price}
                onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                required
              />
            </div>
            <div>
              <label htmlFor="category-entry-total">{totalFieldLabel}</label>
              <input
                id="category-entry-total"
                type="text"
                readOnly
                disabled
                value={formatCurrency(total)}
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
