import { useEffect, useMemo, useState } from "react";
import { listFinanceCategories } from "../api/financeCategories";
import {
  createOperationalEntry,
  deleteOperationalEntry,
  fetchOperationalSummary,
  updateOperationalEntry,
} from "../api/finance";
import Card from "../components/Card";
import RotaryYearField from "../components/RotaryYearField";
import { SectionHeading, TableWrap } from "../components/SectionHeading";
import { useAccess } from "../hooks/useAccess";
import { useTheme } from "../context/ThemeContext";
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

// 2026-08-06: minimal branch matches Dashboard's stat-card shape exactly
// (value-first <span>, then label <span>) — now rendered as three true
// siblings in one row (Revenue/Cost/Result), so `.stat-duo-grid`'s
// position-based blue/gold alternation applies directly, same as every
// other stat-card row in the app. Classic keeps its original label-first
// div layout with each card's own named tone.
function StatCard({ value, label, tone, isMinimal }) {
  if (isMinimal) {
    return (
      <Card variant={tone} className="flex flex-col">
        <span className="text-3xl font-bold">{value}</span>
        <span className="mt-2 text-sm">{label}</span>
      </Card>
    );
  }
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

const EMPTY_FORM = { type: "", category_id: "", amount: "", entry_date: "", notes: "" };

function EntryColumn({
  title,
  rows,
  categories,
  categoryFilter,
  onCategoryFilterChange,
  canWrite,
  onEdit,
  onDelete,
  isMinimal,
}) {
  const filteredRows = categoryFilter
    ? rows.filter((row) => row.category_name === categoryFilter)
    : rows;

  return (
    <div>
      {/* 2026-08-06: the Revenue/Cost totals moved up into a shared 3-card
          row (with the new Result card) above both columns — this heading
          replaces the standalone stat card that used to sit here. */}
      <SectionHeading isMinimal={isMinimal}>{title}</SectionHeading>
      <div className="flex items-center gap-2 mt-2 mb-2">
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
        <TableWrap isMinimal={isMinimal}>
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
        </TableWrap>
      )}
    </div>
  );
}

// Story 17.5 — Finance module, Club Operational Tracking page. Own nav
// entry under Finance (see Story 17.2 follow-up in AppLayout.jsx).
export default function FinanceOperational() {
  const { isMinimal } = useTheme();
  const { canRead, canWrite } = useAccess("finance.operational");
  const { yearOptions, currentYear, selectedYear: year, setSelectedYear: setYear } = useRotaryYears({ persistKey: "finance" });
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

  const sortedCategories = useMemo(
    () =>
      [...categories].sort(
        (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
      ),
    [categories],
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
      type: category?.type ?? "",
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

      {isMinimal ? (
        <RotaryYearField
          year={year}
          yearOptions={yearOptions}
          currentYear={currentYear}
          onChange={setYear}
        />
      ) : (
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
      )}

      {isLoading && <p>Loading…</p>}
      {loadError && (
        <p role="alert" className="text-[var(--color-danger)]">
          {loadError}
        </p>
      )}

      {!isLoading && !loadError && summary && (
        <>
          {/* 2026-08-06: Revenue/Cost totals + new Result card (Revenue -
              Cost) as three real siblings in one row, so `.stat-duo-grid`'s
              position-based blue/gold alternation applies directly — same
              pattern as every other stat-card row in the app. */}
          <div className={`grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 ${isMinimal ? "stat-duo-grid" : ""}`}>
            <StatCard
              value={formatCurrency(summary.total_revenue)}
              label="Total Revenue"
              tone="stat-teal"
              isMinimal={isMinimal}
            />
            <StatCard
              value={formatCurrency(summary.total_cost)}
              label="Total Cost"
              tone="stat-rose"
              isMinimal={isMinimal}
            />
            <StatCard
              value={formatCurrency(summary.total_revenue - summary.total_cost)}
              label="Result"
              tone="stat-blue"
              isMinimal={isMinimal}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <EntryColumn
              title="Total Revenue"
              rows={summary.revenue}
              categories={revenueCategoryNames}
              categoryFilter={revenueCategoryFilter}
              onCategoryFilterChange={setRevenueCategoryFilter}
              canWrite={canWrite}
              onEdit={startEdit}
              onDelete={handleDelete}
              isMinimal={isMinimal}
            />
            <EntryColumn
              title="Total Cost"
              rows={summary.cost}
              categories={costCategoryNames}
              categoryFilter={costCategoryFilter}
              onCategoryFilterChange={setCostCategoryFilter}
              canWrite={canWrite}
              onEdit={startEdit}
              onDelete={handleDelete}
              isMinimal={isMinimal}
            />
          </div>

          {/* 2026-08-06: moved below the Revenue/Cost columns per explicit
              request — was above them before. */}
          {canWrite && (
            <section className="mt-6">
              <SectionHeading isMinimal={isMinimal}>
                {editingId ? "Edit entry" : "Add entry"}
              </SectionHeading>
              <Card variant="default" className="!p-5 !rounded-2xl max-w-[800px]">
                <form onSubmit={handleSubmit} className="donation-form">
                  <div>
                    <label htmlFor="operational-category">Category</label>
                    <select
                      id="operational-category"
                      value={form.category_id}
                      onChange={(event) => {
                        const categoryId = event.target.value;
                        const category = categories.find((c) => c.id === categoryId);
                        setForm({
                          ...form,
                          category_id: categoryId,
                          type: category ? category.type : "",
                        });
                      }}
                      className={SELECT_CLASS}
                      required
                    >
                      <option value="">Select a category…</option>
                      {sortedCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name} ({category.type === "revenue" ? "Revenue" : "Cost"})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="operational-type">Type</label>
                    <input
                      id="operational-type"
                      type="text"
                      readOnly
                      value={form.type === "" ? "" : form.type === "revenue" ? "Revenue" : "Cost"}
                      placeholder="Auto from category"
                      className={INPUT_CLASS}
                    />
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
        </>
      )}
    </div>
  );
}
