import { useEffect, useMemo, useState } from "react";
import { listFinanceCategories } from "../api/financeCategories";
import {
  createOperationalEntry,
  deleteOperationalEntry,
  fetchOperationalSummary,
  updateOperationalEntry,
} from "../api/finance";
import Card from "../components/Card";
import { useAccess } from "../hooks/useAccess";
import { useRotaryYears } from "../hooks/useRotaryYears";
import { useWindowFocusRefetch } from "../hooks/useWindowFocusRefetch";
import { INPUT_CLASS, SELECT_CLASS } from "../styles/formControls";
import { formatDate } from "../utils/formatters";
import { rotaryYear, rotaryYearLabel } from "../utils/rotaryYear";

function formatCurrency(value) {
  return `${Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} HKD`;
}

function StatCard({ value, label, tone }) {
  return (
    <Card variant={tone} className="flex min-h-[104px] flex-col justify-center">
      <div className="text-xs font-semibold text-[var(--color-muted-text)]">{label}</div>
      <div className="mt-1 text-[22px] font-bold">{value}</div>
    </Card>
  );
}

const SUBMIT_BUTTON_CLASS =
  "rounded-lg px-4 py-2 text-[13.5px] font-semibold text-white bg-[var(--color-brand-blue)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border-none";
const CANCEL_BUTTON_CLASS =
  "rounded-lg px-4 py-2 text-[13.5px] font-semibold text-[var(--color-brand-blue)] bg-white border border-[var(--color-brand-blue)] cursor-pointer";

const EMPTY_FORM = { type: "revenue", category_id: "", amount: "", entry_date: "", notes: "" };

function EntryColumn({
  title,
  tone,
  total,
  rows,
  categories,
  categoryFilter,
  onCategoryFilterChange,
  canWrite,
  onEdit,
  onDelete,
}) {
  const filteredRows = categoryFilter
    ? rows.filter((row) => row.category_name === categoryFilter)
    : rows;

  return (
    <div>
      <StatCard value={formatCurrency(total)} label={title} tone={tone} />
      <div className="flex items-center gap-2 mt-4 mb-2">
        <label className="text-xs font-semibold text-[var(--color-muted-text)]">
          Filter by category
        </label>
        <select
          value={categoryFilter}
          onChange={(event) => onCategoryFilterChange(event.target.value)}
          className={`${SELECT_CLASS} !w-auto`}
        >
          <option value="">All categories</option>
          {categories.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {filteredRows.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-text)]">No entries for this filter.</p>
      ) : (
        <Card variant="default" className="!p-0 !rounded-2xl overflow-hidden">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-faint)]">
                <th className="px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]">
                  Category
                </th>
                <th className="px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]">
                  Date
                </th>
                <th className="px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]">
                  Amount
                </th>
                {canWrite && (
                  <th
                    aria-label="Actions"
                    className="px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]"
                  />
                )}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr
                  key={row.id ?? `${row.source}-${row.category_name}`}
                  className="border-b border-[var(--color-border-faint)] last:border-0"
                >
                  <td className="px-4 py-2.5">
                    {row.category_name}
                    {!row.editable && (
                      <span className="ml-1.5 text-xs text-[var(--color-muted-text)]">
                        (auto)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">{row.entry_date ? formatDate(row.entry_date) : "—"}</td>
                  <td className="px-4 py-2.5">{formatCurrency(row.amount)}</td>
                  {canWrite && (
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {row.editable && (
                        <>
                          <button
                            type="button"
                            onClick={() => onEdit(row)}
                            className="text-[var(--color-brand-blue)] bg-transparent border-none cursor-pointer font-semibold text-[13px] mr-3"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(row)}
                            className="text-[var(--color-danger)] bg-transparent border-none cursor-pointer font-semibold text-[13px]"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// Story 17.5 — Finance module, Club Operational Tracking page. Own nav
// entry under Finance (see Story 17.2 follow-up in AppLayout.jsx).
export default function FinanceOperational() {
  const { canRead, canWrite } = useAccess("finance.operational");
  const { yearOptions, selectedYear: year, setSelectedYear: setYear } = useRotaryYears();
  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [revenueCategoryFilter, setRevenueCategoryFilter] = useState("");
  const [costCategoryFilter, setCostCategoryFilter] = useState("");

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  async function loadData({ silent = false } = {}) {
    if (!silent) setIsLoading(true);
    setLoadError(null);
    try {
      const [summaryData, categoriesData] = await Promise.all([
        fetchOperationalSummary({ rotary_year: year }),
        listFinanceCategories(),
      ]);
      setSummary(summaryData);
      setCategories(categoriesData);
    } catch (err) {
      if (!silent) setLoadError(err.detail || "Failed to load operational tracking data");
    } finally {
      if (!silent) setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, canRead]);

  // Member Fees total + Event cost rows are computed from other modules —
  // refetch quietly when the user comes back to this tab so an edit made
  // elsewhere shows up without a full page reload.
  useWindowFocusRefetch(() => loadData({ silent: true }), canRead);

  const formRotaryYear = useMemo(
    () => (form.entry_date ? rotaryYear(form.entry_date) : null),
    [form.entry_date],
  );

  const categoriesForType = useMemo(
    () => categories.filter((category) => category.type === form.type),
    [categories, form.type],
  );

  const revenueCategoryNames = useMemo(
    () => [...new Set((summary?.revenue ?? []).map((row) => row.category_name))],
    [summary],
  );
  const costCategoryNames = useMemo(
    () => [...new Set((summary?.cost ?? []).map((row) => row.category_name))],
    [summary],
  );

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setSaveError(null);
  }

  function startEdit(row) {
    // Auto rows have no id / aren't editable — startEdit is only ever
    // wired to the Edit button, which only renders when row.editable.
    const category = categories.find((c) => c.name === row.category_name);
    setEditingId(row.id);
    setForm({
      type: category?.type ?? "revenue",
      category_id: category?.id ?? "",
      amount: String(row.amount),
      entry_date: row.entry_date ?? "",
      notes: row.notes ?? "",
    });
    setSaveError(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError(null);
    setIsSaving(true);
    try {
      const payload = {
        type: form.type,
        category_id: form.category_id,
        amount: Number(form.amount),
        entry_date: form.entry_date,
        notes: form.notes === "" ? null : form.notes,
      };
      if (editingId) {
        await updateOperationalEntry(editingId, payload);
      } else {
        await createOperationalEntry(payload);
      }
      resetForm();
      await loadData();
    } catch (err) {
      setSaveError(err.detail || "Failed to save entry");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(row) {
    if (!window.confirm("Delete this entry?")) return;
    await deleteOperationalEntry(row.id);
    if (editingId === row.id) resetForm();
    await loadData();
  }

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>Club Operational Tracking</h1>
        <p role="alert">You do not have permission to view Club Operational Tracking.</p>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page-wide">
      <div className="mb-1">
        <h1 className="mb-1">Club Operational Tracking</h1>
        <p className="text-sm text-[var(--color-muted-text)]">
          Revenue and expenses by category — Member Fees and Event costs are pulled in
          automatically.
        </p>
      </div>

      <div className="flex items-center gap-3 mb-4 mt-4">
        <label htmlFor="operational-year" className="text-sm font-semibold">
          Rotary Year
        </label>
        <select
          id="operational-year"
          className={SELECT_CLASS}
          value={year}
          onChange={(event) => setYear(Number(event.target.value))}
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {rotaryYearLabel(y)}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p>Loading…</p>}
      {loadError && (
        <p role="alert" className="text-[var(--color-danger)]">
          {loadError}
        </p>
      )}

      {!isLoading && !loadError && summary && (
        <>
          {canWrite && (
            <section className="mb-6">
              <h2 className="text-[17px] font-bold text-[var(--color-brand-blue)] mb-3">
                {editingId ? "Edit entry" : "Add entry"}
              </h2>
              <Card variant="default" className="!p-5 !rounded-2xl max-w-[800px]">
                <form onSubmit={handleSubmit} className="donation-form">
                  <div>
                    <label htmlFor="operational-type">Type</label>
                    <select
                      id="operational-type"
                      value={form.type}
                      onChange={(event) =>
                        setForm({ ...form, type: event.target.value, category_id: "" })
                      }
                      className={SELECT_CLASS}
                      disabled={!!editingId}
                    >
                      <option value="revenue">Revenue</option>
                      <option value="cost">Cost</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="operational-category">Category</label>
                    <select
                      id="operational-category"
                      value={form.category_id}
                      onChange={(event) => setForm({ ...form, category_id: event.target.value })}
                      className={SELECT_CLASS}
                      required
                    >
                      <option value="">Select a category…</option>
                      {categoriesForType.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="operational-amount">Amount (HKD)</label>
                    <input
                      id="operational-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.amount}
                      onChange={(event) => setForm({ ...form, amount: event.target.value })}
                      className={INPUT_CLASS}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="operational-date">Date</label>
                    <input
                      id="operational-date"
                      type="date"
                      value={form.entry_date}
                      onChange={(event) => setForm({ ...form, entry_date: event.target.value })}
                      className={INPUT_CLASS}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="operational-rotary-year">Rotary year</label>
                    <input
                      id="operational-rotary-year"
                      type="text"
                      readOnly
                      value={formRotaryYear === null ? "" : rotaryYearLabel(formRotaryYear)}
                      placeholder="Auto from date"
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div className="field-full">
                    <label htmlFor="operational-notes">Notes</label>
                    <input
                      id="operational-notes"
                      type="text"
                      value={form.notes}
                      onChange={(event) => setForm({ ...form, notes: event.target.value })}
                      className={INPUT_CLASS}
                    />
                  </div>
                  {saveError && <p role="alert">{saveError}</p>}
                  <div className="modal-actions flex gap-3">
                    <button type="submit" disabled={isSaving} className={SUBMIT_BUTTON_CLASS}>
                      {isSaving ? "Saving…" : editingId ? "Update entry" : "Add entry"}
                    </button>
                    {editingId && (
                      <button type="button" onClick={resetForm} className={CANCEL_BUTTON_CLASS}>
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              </Card>
            </section>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <EntryColumn
              title="Total Revenue"
              tone="stat-teal"
              total={summary.total_revenue}
              rows={summary.revenue}
              categories={revenueCategoryNames}
              categoryFilter={revenueCategoryFilter}
              onCategoryFilterChange={setRevenueCategoryFilter}
              canWrite={canWrite}
              onEdit={startEdit}
              onDelete={handleDelete}
            />
            <EntryColumn
              title="Total Cost"
              tone="stat-rose"
              total={summary.total_cost}
              rows={summary.cost}
              categories={costCategoryNames}
              categoryFilter={costCategoryFilter}
              onCategoryFilterChange={setCostCategoryFilter}
              canWrite={canWrite}
              onEdit={startEdit}
              onDelete={handleDelete}
            />
          </div>
        </>
      )}
    </div>
  );
}
