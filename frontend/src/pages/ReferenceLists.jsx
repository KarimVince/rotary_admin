import { useEffect, useState } from "react";
import {
  createMemberTitle,
  deactivateMemberTitle,
  listMemberTitles,
  updateMemberTitle,
} from "../api/memberTitles";
import {
  createHonorific,
  deactivateHonorific,
  listHonorifics,
  updateHonorific,
} from "../api/honorifics";
import {
  createNgoClassification,
  deleteNgoClassification,
  listNgoClassifications,
  reorderNgoClassifications,
  updateNgoClassification,
} from "../api/ngoClassifications";
import {
  createDinnerEventType,
  deleteDinnerEventType,
  listDinnerEventTypes,
  reorderDinnerEventTypes,
  updateDinnerEventType,
} from "../api/dinnerEventTypes";
import Card from "../components/Card";
import { useAccess } from "../hooks/useAccess";

const PRIMARY_BUTTON_CLASS =
  "rounded-full px-4 py-2 text-[13px] font-semibold text-white bg-[var(--color-brand-blue)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
const SECONDARY_BUTTON_CLASS =
  "rounded-full px-4 py-2 text-[13px] font-semibold text-[var(--color-muted-text-strong)] bg-[var(--color-border-light)] hover:bg-[var(--color-card-border)] cursor-pointer";
const INPUT_CLASS = "border border-[var(--color-card-border)] rounded-md px-2.5 py-1.5 text-[13px]";
const STATUS_CHIP_CLASS = "inline-block rounded-full px-2.5 py-1 text-xs font-bold";

function StatusChip({ active }) {
  return (
    <span
      className={`${STATUS_CHIP_CLASS} ${
        active
          ? "bg-[var(--tone-teal-bg)] text-[var(--color-tone-teal-text)]"
          : "bg-[var(--color-border-light)] text-[var(--color-muted-text)]"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function CardShell({ label, title, subtitle, children }) {
  return (
    <section aria-label={label}>
      <Card variant="default" className="!p-5 !rounded-2xl h-full">
        <div className="text-base font-bold text-[var(--color-brand-blue-dark)]">{title}</div>
        {subtitle && <p className="text-xs text-[var(--color-muted-text)] mt-1 mb-3">{subtitle}</p>}
        {!subtitle && <div className="mb-3" />}
        {children}
      </Card>
    </section>
  );
}

// ---------- Member Titles ----------

const EMPTY_TITLE_FORM = { code: "", label: "", sort_order: 0 };

function MemberTitlesCard() {
  const { canRead, canWrite } = useAccess("admin.member_titles");
  const [titles, setTitles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(EMPTY_TITLE_FORM);
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
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    loadTitles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead]);

  function startEdit(title) {
    setEditingId(title.id);
    setForm({ code: title.code, label: title.label, sort_order: title.sort_order });
    setSaveError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_TITLE_FORM);
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

  if (!canRead) return null;

  return (
    <CardShell label="Member Titles" title="Member Titles">
      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}
      {!isLoading && !loadError && (
        <div className="flex flex-col gap-1.5 mb-3">
          {titles.map((title) => (
            <div
              key={title.id}
              className="flex items-center gap-2 px-2.5 py-2 bg-[var(--color-border-light)] rounded-lg text-[13px]"
            >
              <span className="font-semibold text-[#0c2340] w-14 shrink-0">{title.code}</span>
              <span className="flex-1 text-[var(--color-muted-text)] truncate">{title.label}</span>
              <StatusChip active={title.is_active} />
              {canWrite && (
                <>
                  <button type="button" onClick={() => startEdit(title)} className="text-xs font-semibold text-[var(--color-brand-blue)] bg-transparent border-none cursor-pointer">
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(title)}
                    className="text-xs font-semibold text-[var(--color-muted-text-strong)] bg-transparent border-none cursor-pointer"
                  >
                    {title.is_active ? "Deactivate" : "Activate"}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {canWrite && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 border-t border-[var(--color-border-light)] pt-3">
          <h3 className="text-[13px] font-bold text-[var(--color-brand-blue-dark)]">
            {editingId ? "Edit title" : "Add title"}
          </h3>
          <label htmlFor="title-code" className="text-xs text-[var(--color-muted-text)]">
            Code
          </label>
          <input
            id="title-code"
            type="text"
            value={form.code}
            onChange={(event) => setForm({ ...form, code: event.target.value })}
            required
            className={INPUT_CLASS}
          />
          <label htmlFor="title-label" className="text-xs text-[var(--color-muted-text)]">
            Label
          </label>
          <input
            id="title-label"
            type="text"
            value={form.label}
            onChange={(event) => setForm({ ...form, label: event.target.value })}
            required
            className={INPUT_CLASS}
          />
          <label htmlFor="title-sort-order" className="text-xs text-[var(--color-muted-text)]">
            Sort order
          </label>
          <input
            id="title-sort-order"
            type="number"
            value={form.sort_order}
            onChange={(event) => setForm({ ...form, sort_order: event.target.value })}
            className={INPUT_CLASS}
          />
          {saveError && <p role="alert">{saveError}</p>}
          <div className="flex gap-2 mt-1">
            <button type="submit" disabled={isSaving} className={PRIMARY_BUTTON_CLASS}>
              {isSaving ? "Saving…" : editingId ? "Update title" : "Add title"}
            </button>
            {editingId && (
              <button type="button" onClick={cancelEdit} className={SECONDARY_BUTTON_CLASS}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </CardShell>
  );
}

// ---------- Honorifics ----------

const EMPTY_HONORIFIC_FORM = { code: "", label: "", sort_order: 0 };

function HonorificsCard() {
  const { canRead, canWrite } = useAccess("admin.honorifics");
  const [honorifics, setHonorifics] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(EMPTY_HONORIFIC_FORM);
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  async function loadHonorifics() {
    setIsLoading(true);
    try {
      const data = await listHonorifics({ includeInactive: true });
      setHonorifics(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.detail || "Failed to load honorifics");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    loadHonorifics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead]);

  function startEdit(honorific) {
    setEditingId(honorific.id);
    setForm({ code: honorific.code, label: honorific.label, sort_order: honorific.sort_order });
    setSaveError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_HONORIFIC_FORM);
    setSaveError(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError(null);
    setIsSaving(true);
    try {
      const payload = { ...form, sort_order: Number(form.sort_order) };
      if (editingId) {
        await updateHonorific(editingId, payload);
      } else {
        await createHonorific(payload);
      }
      cancelEdit();
      await loadHonorifics();
    } catch (err) {
      setSaveError(err.detail || "Failed to save honorific");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive(honorific) {
    if (honorific.is_active) {
      await deactivateHonorific(honorific.id);
    } else {
      await updateHonorific(honorific.id, { is_active: true });
    }
    await loadHonorifics();
  }

  if (!canRead) return null;

  return (
    <CardShell
      label="Honorifics"
      title="Honorifics"
      subtitle="Salutations offered on the member form — distinct from the Rotary role titles managed under Member Titles."
    >
      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}
      {!isLoading && !loadError && (
        <div className="flex flex-col gap-1.5 mb-3">
          {honorifics.map((honorific) => (
            <div
              key={honorific.id}
              className="flex items-center gap-2 px-2.5 py-2 bg-[var(--color-border-light)] rounded-lg text-[13px]"
            >
              <span className="font-semibold text-[#0c2340] w-14 shrink-0">{honorific.code}</span>
              <span className="flex-1 text-[var(--color-muted-text)] truncate">{honorific.label}</span>
              <StatusChip active={honorific.is_active} />
              {canWrite && (
                <>
                  <button type="button" onClick={() => startEdit(honorific)} className="text-xs font-semibold text-[var(--color-brand-blue)] bg-transparent border-none cursor-pointer">
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(honorific)}
                    className="text-xs font-semibold text-[var(--color-muted-text-strong)] bg-transparent border-none cursor-pointer"
                  >
                    {honorific.is_active ? "Deactivate" : "Activate"}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {canWrite && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 border-t border-[var(--color-border-light)] pt-3">
          <h3 className="text-[13px] font-bold text-[var(--color-brand-blue-dark)]">
            {editingId ? "Edit honorific" : "Add honorific"}
          </h3>
          <label htmlFor="honorific-code" className="text-xs text-[var(--color-muted-text)]">
            Code
          </label>
          <input
            id="honorific-code"
            type="text"
            value={form.code}
            onChange={(event) => setForm({ ...form, code: event.target.value })}
            required
            className={INPUT_CLASS}
          />
          <label htmlFor="honorific-label" className="text-xs text-[var(--color-muted-text)]">
            Label
          </label>
          <input
            id="honorific-label"
            type="text"
            value={form.label}
            onChange={(event) => setForm({ ...form, label: event.target.value })}
            required
            className={INPUT_CLASS}
          />
          <label htmlFor="honorific-sort-order" className="text-xs text-[var(--color-muted-text)]">
            Sort order
          </label>
          <input
            id="honorific-sort-order"
            type="number"
            value={form.sort_order}
            onChange={(event) => setForm({ ...form, sort_order: event.target.value })}
            className={INPUT_CLASS}
          />
          {saveError && <p role="alert">{saveError}</p>}
          <div className="flex gap-2 mt-1">
            <button type="submit" disabled={isSaving} className={PRIMARY_BUTTON_CLASS}>
              {isSaving ? "Saving…" : editingId ? "Update honorific" : "Add honorific"}
            </button>
            {editingId && (
              <button type="button" onClick={cancelEdit} className={SECONDARY_BUTTON_CLASS}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </CardShell>
  );
}

// ---------- NGO Classifications ----------

const EMPTY_CLASSIFICATION_FORM = { name: "", description: "" };

function NgoClassificationsCard() {
  const { canRead, canWrite } = useAccess("admin.ngo_classifications");
  const [classifications, setClassifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(EMPTY_CLASSIFICATION_FORM);
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
    setForm(EMPTY_CLASSIFICATION_FORM);
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

  if (!canRead) return null;

  return (
    <CardShell label="NGO Classifications" title="NGO Classification">
      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}
      {!isLoading && !loadError && (
        <div className="flex flex-col gap-1.5 mb-3">
          {classifications.map((classification, index) => (
            <div
              key={classification.id}
              className="flex items-center gap-2 px-2.5 py-2 bg-[var(--color-border-light)] rounded-lg text-[13px]"
            >
              {canWrite && (
                <div className="flex flex-col shrink-0">
                  <button
                    type="button"
                    aria-label={`Move ${classification.name} up`}
                    disabled={index === 0}
                    onClick={() => handleMove(index, -1)}
                    className="bg-transparent border-none cursor-pointer disabled:opacity-30 text-[var(--color-muted-text)] leading-none"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${classification.name} down`}
                    disabled={index === classifications.length - 1}
                    onClick={() => handleMove(index, 1)}
                    className="bg-transparent border-none cursor-pointer disabled:opacity-30 text-[var(--color-muted-text)] leading-none"
                  >
                    ↓
                  </button>
                </div>
              )}
              <span className="flex-1 text-[#0c2340] truncate">{classification.name}</span>
              <span className="text-xs text-[var(--color-muted-text)] shrink-0">
                {classification.organisation_count}
              </span>
              {canWrite && (
                <>
                  <button type="button" onClick={() => startEdit(classification)} className="text-xs font-semibold text-[var(--color-brand-blue)] bg-transparent border-none cursor-pointer">
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(classification)}
                    className="text-xs font-semibold text-[#b23b3b] bg-transparent border-none cursor-pointer"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {canWrite && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 border-t border-[var(--color-border-light)] pt-3">
          <h3 className="text-[13px] font-bold text-[var(--color-brand-blue-dark)]">
            {editingId ? "Edit classification" : "Add classification"}
          </h3>
          <label htmlFor="classification-name" className="text-xs text-[var(--color-muted-text)]">
            Name
          </label>
          <input
            id="classification-name"
            type="text"
            maxLength={100}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
            className={INPUT_CLASS}
          />
          <label htmlFor="classification-description" className="text-xs text-[var(--color-muted-text)]">
            Description
          </label>
          <textarea
            id="classification-description"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            className={INPUT_CLASS}
          />
          {saveError && <p role="alert">{saveError}</p>}
          <div className="flex gap-2 mt-1">
            <button type="submit" disabled={isSaving} className={PRIMARY_BUTTON_CLASS}>
              {isSaving ? "Saving…" : editingId ? "Update classification" : "Add classification"}
            </button>
            {editingId && (
              <button type="button" onClick={cancelEdit} className={SECONDARY_BUTTON_CLASS}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </CardShell>
  );
}

// ---------- Dinner Event Types ----------

const EMPTY_TYPE_FORM = { name: "", color_bg: "", color_text: "" };

function DinnerEventTypesCard() {
  const { canRead, canWrite } = useAccess("admin.dinner_event_types");
  const [types, setTypes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(EMPTY_TYPE_FORM);
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
    setForm({ name: type.name, color_bg: type.color_bg ?? "", color_text: type.color_text ?? "" });
    setSaveError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_TYPE_FORM);
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

  if (!canRead) return null;

  return (
    <CardShell label="Dinner Event Types" title="Dinner Event Types">
      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}
      {!isLoading && !loadError && (
        <div className="flex flex-col gap-1.5 mb-3">
          {types.map((type, index) => (
            <div
              key={type.id}
              className="flex items-center gap-2 px-2.5 py-2 bg-[var(--color-border-light)] rounded-lg text-[13px]"
            >
              {canWrite && (
                <div className="flex flex-col shrink-0">
                  <button
                    type="button"
                    aria-label={`Move ${type.name} up`}
                    disabled={index === 0}
                    onClick={() => handleMove(index, -1)}
                    className="bg-transparent border-none cursor-pointer disabled:opacity-30 text-[var(--color-muted-text)] leading-none"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${type.name} down`}
                    disabled={index === types.length - 1}
                    onClick={() => handleMove(index, 1)}
                    className="bg-transparent border-none cursor-pointer disabled:opacity-30 text-[var(--color-muted-text)] leading-none"
                  >
                    ↓
                  </button>
                </div>
              )}
              {type.color_bg && type.color_text ? (
                <span
                  className="rounded-full px-2.5 py-1 text-[11px] font-bold shrink-0"
                  style={{ background: type.color_bg, color: type.color_text }}
                >
                  {type.name}
                </span>
              ) : (
                <span className="flex-1 text-[#0c2340] truncate">{type.name}</span>
              )}
              <span className="flex-1" />
              <span className="text-xs text-[var(--color-muted-text)] shrink-0">{type.event_count}</span>
              {canWrite && (
                <>
                  <button type="button" onClick={() => startEdit(type)} className="text-xs font-semibold text-[var(--color-brand-blue)] bg-transparent border-none cursor-pointer">
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(type)}
                    className="text-xs font-semibold text-[#b23b3b] bg-transparent border-none cursor-pointer"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {canWrite && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 border-t border-[var(--color-border-light)] pt-3">
          <h3 className="text-[13px] font-bold text-[var(--color-brand-blue-dark)]">
            {editingId ? "Edit event type" : "Add event type"}
          </h3>
          <label htmlFor="event-type-name" className="text-xs text-[var(--color-muted-text)]">
            Name
          </label>
          <input
            id="event-type-name"
            type="text"
            maxLength={50}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
            className={INPUT_CLASS}
          />
          <label htmlFor="event-type-color-bg" className="text-xs text-[var(--color-muted-text)]">
            Chip background (hex, optional)
          </label>
          <input
            id="event-type-color-bg"
            type="text"
            placeholder="#e3edfb"
            pattern="#[0-9A-Fa-f]{6}"
            title='Hex color like "#e3edfb"'
            maxLength={20}
            value={form.color_bg}
            onChange={(event) => setForm({ ...form, color_bg: event.target.value })}
            className={INPUT_CLASS}
          />
          <label htmlFor="event-type-color-text" className="text-xs text-[var(--color-muted-text)]">
            Chip text color (hex, optional)
          </label>
          <input
            id="event-type-color-text"
            type="text"
            placeholder="#17458f"
            pattern="#[0-9A-Fa-f]{6}"
            title='Hex color like "#17458f"'
            maxLength={20}
            value={form.color_text}
            onChange={(event) => setForm({ ...form, color_text: event.target.value })}
            className={INPUT_CLASS}
          />
          {form.color_bg && form.color_text && (
            <span
              className="rounded-full px-2.5 py-1 text-[11px] font-bold w-fit"
              style={{ background: form.color_bg, color: form.color_text }}
            >
              {form.name || "Preview"}
            </span>
          )}
          {saveError && <p role="alert">{saveError}</p>}
          <div className="flex gap-2 mt-1">
            <button type="submit" disabled={isSaving} className={PRIMARY_BUTTON_CLASS}>
              {isSaving ? "Saving…" : editingId ? "Update event type" : "Add event type"}
            </button>
            {editingId && (
              <button type="button" onClick={cancelEdit} className={SECONDARY_BUTTON_CLASS}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </CardShell>
  );
}

export default function ReferenceLists() {
  return (
    <div className="admin-page">
      <h1>Reference Lists</h1>
      <p className="mt-1 mb-5 text-sm text-[var(--color-muted-text)]">
        Small option lists used across member and event forms.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <MemberTitlesCard />
        <HonorificsCard />
        <NgoClassificationsCard />
        <DinnerEventTypesCard />
      </div>
    </div>
  );
}
