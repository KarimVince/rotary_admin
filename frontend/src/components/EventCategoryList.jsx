import { useEffect, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";

// Story 14.3: cost categories and sponsor categories are two separate
// global lookups with identical add/edit/delete behaviour — one component
// parameterized by the CRUD functions and a label, used twice on the Setup
// page.
export default function EventCategoryList({ label, listFn, createFn, updateFn, deleteFn }) {
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [error, setError] = useState(null);

  async function load() {
    setIsLoading(true);
    try {
      setCategories(await listFn());
      setError(null);
    } catch (err) {
      setError(err.detail || `Failed to load ${label.toLowerCase()}`);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAdd(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await createFn({ name: newName.trim() });
      setNewName("");
      setError(null);
      await load();
    } catch (err) {
      setError(err.detail || "Failed to add category");
    }
  }

  function startEdit(category) {
    setEditingId(category.id);
    setEditingName(category.name);
  }

  async function handleSaveEdit(categoryId) {
    try {
      await updateFn(categoryId, { name: editingName.trim() });
      setEditingId(null);
      setError(null);
      await load();
    } catch (err) {
      setError(err.detail || "Failed to update category");
    }
  }

  async function handleDelete(category) {
    if (!window.confirm(`Delete category "${category.name}"?`)) return;
    await deleteFn(category.id);
    await load();
  }

  return (
    <div className="rounded-2xl bg-white p-[22px] shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[13px] font-bold uppercase tracking-[0.03em] text-[var(--text-h)]">{label}</span>
      </div>
      {error && (
        <p role="alert" className="mb-2 text-[13px] text-[var(--color-tone-rose-text)]">
          {error}
        </p>
      )}
      {isLoading ? (
        <p className="text-[13px] text-[var(--color-muted-text)]">Loading…</p>
      ) : (
        <div className="flex flex-col gap-2">
          {categories.map((category) => (
            <div
              key={category.id}
              className="flex items-center justify-between rounded-[10px] bg-[var(--color-border-light)] px-3 py-[9px] text-[13px] text-[var(--text-h)]"
            >
              {editingId === category.id ? (
                <>
                  <input
                    aria-label={`Edit ${category.name}`}
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="flex-1 rounded border border-[var(--color-border-medium)] px-2 py-1 text-[13px]"
                  />
                  <div className="flex items-center gap-1 pl-2">
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(category.id)}
                      title="Save"
                      aria-label={`Save ${category.name}`}
                      className="event-iact"
                    >
                      <Check className="w-[14px] h-[14px]" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      title="Cancel"
                      aria-label="Cancel edit"
                      className="event-iact"
                    >
                      <X className="w-[14px] h-[14px]" aria-hidden="true" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span>{category.name}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(category)}
                      title="Edit"
                      aria-label={`Edit ${category.name}`}
                      className="event-iact"
                    >
                      <Pencil className="w-[14px] h-[14px]" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(category)}
                      title="Delete"
                      aria-label={`Delete ${category.name}`}
                      className="event-iact event-iact-danger"
                    >
                      <Trash2 className="w-[14px] h-[14px]" aria-hidden="true" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <form onSubmit={handleAdd} className="mt-3 flex items-center gap-2">
        <label htmlFor={`${label}-new-category`} className="sr-only">
          {label} name
        </label>
        <input
          id={`${label}-new-category`}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 rounded-[10px] border border-[var(--color-border-medium)] px-3 py-2 text-[13px]"
        />
        <button
          type="submit"
          className="rounded-[10px] bg-[var(--color-brand-blue)] px-4 py-2 text-[13px] font-semibold text-white"
        >
          Add
        </button>
      </form>
    </div>
  );
}
