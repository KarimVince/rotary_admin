import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  FileDown,
  Filter,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useAccess } from "../hooks/useAccess";
import { useTheme } from "../context/ThemeContext";
import { formatCurrency } from "../utils/formatters";
import EventCategoryEntryFormModal from "./EventCategoryEntryFormModal";
import Card from "./Card";
import MultiSelectDropdown from "./MultiSelectDropdown";

function buildSortableColumns(totalFieldLabel) {
  return [
    { key: "name", label: "Name" },
    { key: "category", label: "Category" },
    { key: "quantity", label: "Quantity" },
    { key: "unit_price", label: "Unit Price" },
    { key: "total", label: totalFieldLabel },
  ];
}

function entrySortValue(entry, key) {
  switch (key) {
    case "total":
      return entry.total_cost ?? entry.total_amount ?? 0;
    case "quantity":
    case "unit_price":
      return entry[key] ?? 0;
    default:
      return entry[key] || "";
  }
}

const CHIP_TONES = [
  { bg: "var(--tone-blue-bg)", color: "var(--color-brand-blue)" },
  { bg: "var(--tone-amber-bg)", color: "var(--color-tone-amber-text)" },
  { bg: "var(--tone-lavender-bg)", color: "var(--color-tone-lavender-text)" },
  { bg: "var(--tone-teal-bg)", color: "var(--color-tone-teal-text)" },
  { bg: "var(--tone-rose-bg)", color: "var(--color-tone-rose-text)" },
];

function categoryTone(category, categories) {
  const index = categories.indexOf(category);
  return CHIP_TONES[index === -1 ? 0 : index % CHIP_TONES.length];
}

function TableWrapper({ isMinimal, children }) {
  if (isMinimal) {
    return <div className="overflow-hidden">{children}</div>;
  }
  return (
    <Card variant="default" className="p-0 overflow-hidden">
      {children}
    </Card>
  );
}

// Shared panel body for Operational Cost (Story 14.8) and Sponsor (Story
// 14.9) — identical structure (flat data table with a category chip column,
// add/edit/delete, PDF/CSV report), differing only in which API functions
// and labels are wired in.
export default function EventCategoryEntryPage({
  event: selectedEvent,
  title,
  accessKey,
  totalFieldLabel,
  showTotalRow = false,
  listCategoriesFn,
  listEntriesFn,
  createEntryFn,
  updateEntryFn,
  deleteEntryFn,
  downloadReportFn,
}) {
  const { isMinimal } = useTheme();
  const { canRead, canWrite } = useAccess(accessKey);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [categories, setCategories] = useState([]);
  const [entries, setEntries] = useState([]);
  const [isLoadingEntries, setIsLoadingEntries] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);

  const [reportFormat, setReportFormat] = useState("pdf");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState(null);

  const [categoryFilters, setCategoryFilters] = useState([]);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    listCategoriesFn()
      .then(setCategories)
      .catch((err) => setLoadError(err.detail || "Failed to load"))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead]);

  async function loadEntries() {
    if (!selectedEvent) return;
    setIsLoadingEntries(true);
    const data = await listEntriesFn(selectedEvent.id);
    setEntries(data);
    setIsLoadingEntries(false);
  }

  useEffect(() => {
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvent]);

  const categoryNames = useMemo(() => categories.map((c) => c.name), [categories]);

  const total = useMemo(
    () => entries.reduce((sum, e) => sum + (e.total_cost ?? e.total_amount ?? 0), 0),
    [entries],
  );

  const sortableColumns = useMemo(() => buildSortableColumns(totalFieldLabel), [totalFieldLabel]);

  const visibleEntries = useMemo(() => {
    let rows = entries;
    if (categoryFilters.length > 0) {
      rows = rows.filter((entry) => categoryFilters.includes(entry.category || ""));
    }
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const av = entrySortValue(a, sortKey);
        const bv = entrySortValue(b, sortKey);
        const cmp =
          typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [entries, categoryFilters, sortKey, sortDir]);

  function openCreate() {
    setEditingEntry(null);
    setIsFormOpen(true);
  }

  function openEdit(entry) {
    setEditingEntry(entry);
    setIsFormOpen(true);
  }

  function handleSaved() {
    setIsFormOpen(false);
    setEditingEntry(null);
    loadEntries();
  }

  async function handleDelete(entry) {
    if (!window.confirm(`Delete "${entry.name}"?`)) return;
    await deleteEntryFn(selectedEvent.id, entry.id);
    loadEntries();
  }

  async function handleGenerateReport() {
    setIsGeneratingReport(true);
    setReportError(null);
    try {
      const { blob, filename } = await downloadReportFn(selectedEvent.id, reportFormat);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setReportError(err.detail || "Failed to generate report");
    } finally {
      setIsGeneratingReport(false);
    }
  }

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>{title}</h1>
        <p role="alert">You do not have permission to view {title}.</p>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page-wide">
      {!isMinimal && (
        <div className="mb-5 flex items-center justify-between">
          <h1 className="m-0 text-2xl font-semibold text-[var(--text-h)]">{title}</h1>
          {canWrite && selectedEvent && (
            <button
              type="button"
              onClick={openCreate}
              className="rounded-[10px] bg-[var(--color-brand-blue)] px-[18px] py-[9px] text-[13px] font-semibold text-white"
            >
              Add Item
            </button>
          )}
        </div>
      )}

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && (
        <>
          {selectedEvent && isLoadingEntries && <p>Loading items…</p>}

          {selectedEvent && !isLoadingEntries && (
            <>
              <div className={`mb-4 flex ${isMinimal ? "items-end justify-between" : "items-center"} gap-3`}>
                <div className={isMinimal ? "flex items-end gap-3" : "flex items-center gap-3"}>
                  {isMinimal ? (
                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor={`${accessKey}-report-format`}
                        className="pl-0.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]"
                      >
                        Format
                      </label>
                      <select
                        id={`${accessKey}-report-format`}
                        value={reportFormat}
                        onChange={(e) => setReportFormat(e.target.value)}
                        disabled={isGeneratingReport}
                        className="h-[38px] rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13.5px] text-[var(--ink)]"
                      >
                        <option value="pdf">PDF</option>
                        <option value="csv">CSV</option>
                      </select>
                    </div>
                  ) : (
                    <>
                      <label htmlFor={`${accessKey}-report-format`} className="sr-only">
                        Format
                      </label>
                      <select
                        id={`${accessKey}-report-format`}
                        value={reportFormat}
                        onChange={(e) => setReportFormat(e.target.value)}
                        disabled={isGeneratingReport}
                        className="rounded-[10px] border border-[var(--color-border-medium)] px-3 py-2 text-[13px]"
                      >
                        <option value="pdf">PDF</option>
                        <option value="csv">CSV</option>
                      </select>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={handleGenerateReport}
                    disabled={isGeneratingReport}
                    className={
                      isMinimal
                        ? "inline-flex h-[38px] items-center gap-[7px] rounded-[8px] border border-[var(--border)] bg-transparent px-[15px] text-[13.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--bg-alt)]"
                        : "rounded-[10px] bg-[var(--color-brand-blue-light)] px-4 py-[9px] text-[13px] font-semibold text-[var(--color-brand-blue)]"
                    }
                  >
                    {isMinimal && <FileDown className="w-[15px] h-[15px]" aria-hidden="true" />}
                    {isGeneratingReport ? "Generating…" : "Generate Report"}
                  </button>
                  {categoryNames.length > 0 && (
                    <MultiSelectDropdown
                      icon={Filter}
                      ariaLabel="Category"
                      allLabel="All categories"
                      options={categoryNames.map((name) => ({ value: name, label: name }))}
                      selected={categoryFilters}
                      onToggleOption={(value) =>
                        setCategoryFilters((current) =>
                          current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
                        )
                      }
                      onClear={() => setCategoryFilters([])}
                    />
                  )}
                </div>
                {isMinimal && canWrite && selectedEvent && (
                  <button
                    type="button"
                    onClick={openCreate}
                    className="inline-flex h-[38px] items-center gap-[7px] rounded-[8px] bg-[var(--accent)] px-[15px] text-[13.5px] font-semibold text-white hover:bg-[var(--accent-ink)]"
                  >
                    <Plus className="w-[15px] h-[15px]" aria-hidden="true" />
                    Add Item
                  </button>
                )}
              </div>
              {reportError && <p role="alert">{reportError}</p>}

              {entries.length === 0 ? (
                <p className="member-empty-state">No items added for this event yet.</p>
              ) : visibleEntries.length === 0 ? (
                <p className="member-empty-state">No items match the selected filter.</p>
              ) : (
                <TableWrapper isMinimal={isMinimal}>
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-[var(--color-border-faint)]">
                        {sortableColumns.map(({ key, label }) => (
                          <th
                            key={key}
                            className="px-5 py-3 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]"
                          >
                            <button
                              type="button"
                              onClick={() => toggleSort(key)}
                              className="inline-flex items-center gap-1 bg-transparent p-0 uppercase tracking-[0.03em] text-inherit"
                            >
                              {label}
                              {sortKey === key ? (
                                sortDir === "asc" ? (
                                  <ChevronUp className="w-3 h-3" aria-hidden="true" />
                                ) : (
                                  <ChevronDown className="w-3 h-3" aria-hidden="true" />
                                )
                              ) : (
                                <ChevronsUpDown className="w-3 h-3 opacity-40" aria-hidden="true" />
                              )}
                            </button>
                          </th>
                        ))}
                        <th className="px-5 py-3 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleEntries.map((entry) => {
                        const tone = categoryTone(entry.category, categoryNames);
                        return (
                          <tr
                            key={entry.id}
                            className="border-b border-[var(--color-border-light)] text-[13px] text-[var(--text-h)] last:border-b-0"
                          >
                            <td className="px-5 py-[13px] font-semibold">{entry.name}</td>
                            <td className="px-5 py-[13px]">
                              {entry.category && (
                                <span
                                  className="w-fit rounded-full px-[10px] py-[3px] text-[11px] font-bold"
                                  style={{ background: tone.bg, color: tone.color }}
                                >
                                  {entry.category}
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-[13px]">{entry.quantity}</td>
                            <td className="px-5 py-[13px]">{formatCurrency(entry.unit_price)}</td>
                            <td className="px-5 py-[13px] font-semibold">
                              {formatCurrency(entry.total_cost ?? entry.total_amount)}
                            </td>
                            <td className="px-5 py-[13px]">
                              {canWrite && (
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => openEdit(entry)}
                                    title="Edit"
                                    className="event-iact"
                                  >
                                    <Pencil className="w-[14px] h-[14px]" aria-hidden="true" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(entry)}
                                    title="Delete"
                                    className="event-iact event-iact-danger"
                                  >
                                    <Trash2 className="w-[14px] h-[14px]" aria-hidden="true" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {showTotalRow && (
                        <tr className="bg-[var(--color-border-light)] text-[13px] font-bold text-[var(--text-h)]">
                          <td className="px-5 py-[13px]">Total</td>
                          <td className="px-5 py-[13px]" />
                          <td className="px-5 py-[13px]" />
                          <td className="px-5 py-[13px]" />
                          <td className="px-5 py-[13px]">{formatCurrency(total)}</td>
                          <td className="px-5 py-[13px]" />
                        </tr>
                      )}
                    </tbody>
                  </table>
                </TableWrapper>
              )}
            </>
          )}
        </>
      )}

      {isFormOpen && selectedEvent && (
        <EventCategoryEntryFormModal
          entry={editingEntry}
          categories={categories}
          totalFieldLabel={totalFieldLabel}
          createFn={(payload) => createEntryFn(selectedEvent.id, payload)}
          updateFn={(entryId, payload) => updateEntryFn(selectedEvent.id, entryId, payload)}
          onClose={() => setIsFormOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
