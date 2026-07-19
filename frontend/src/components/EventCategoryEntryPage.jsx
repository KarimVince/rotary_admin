import { useEffect, useMemo, useState } from "react";
import { useAccess } from "../hooks/useAccess";
import { formatCurrency } from "../utils/formatters";
import EventCategoryEntryFormModal from "./EventCategoryEntryFormModal";
import Card from "./Card";

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
      <div className="mb-5 flex items-center justify-between">
        <h1 className="m-0 text-2xl font-semibold text-[#0c2340]">{title}</h1>
        {canWrite && selectedEvent && (
          <button
            type="button"
            onClick={openCreate}
            className="rounded-[10px] bg-[var(--color-brand-blue)] px-[18px] py-[9px] text-[13px] font-semibold text-white"
          >
            + Add Item
          </button>
        )}
      </div>

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && (
        <>
          {selectedEvent && isLoadingEntries && <p>Loading items…</p>}

          {selectedEvent && !isLoadingEntries && (
            <>
              <div className="mb-4 flex items-center gap-3">
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
                <button
                  type="button"
                  onClick={handleGenerateReport}
                  disabled={isGeneratingReport}
                  className="rounded-[10px] bg-[var(--color-brand-blue-light)] px-4 py-[9px] text-[13px] font-semibold text-[var(--color-brand-blue)]"
                >
                  {isGeneratingReport ? "Generating…" : "Generate Report"}
                </button>
              </div>
              {reportError && <p role="alert">{reportError}</p>}

              {entries.length === 0 ? (
                <p className="member-empty-state">No items added for this event yet.</p>
              ) : (
                <Card variant="default" className="p-0 overflow-hidden">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-[var(--color-border-faint)]">
                        {["Name", "Category", "Quantity", "Unit Price", totalFieldLabel, "Actions"].map(
                          (label) => (
                            <th
                              key={label}
                              className="px-5 py-3 text-[12px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-text)]"
                            >
                              {label}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry) => {
                        const tone = categoryTone(entry.category, categoryNames);
                        return (
                          <tr
                            key={entry.id}
                            className="border-b border-[var(--color-border-light)] text-[13px] text-[#0c2340] last:border-b-0"
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
                                <div className="flex gap-3">
                                  <button
                                    type="button"
                                    onClick={() => openEdit(entry)}
                                    className="bg-transparent p-0 text-[12px] font-semibold text-[var(--color-brand-blue)]"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(entry)}
                                    className="bg-transparent p-0 text-[12px] font-semibold text-[var(--color-tone-rose-text)]"
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {showTotalRow && (
                        <tr className="bg-[var(--color-border-light)] text-[13px] font-bold text-[#0c2340]">
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
                </Card>
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
