import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, FileDown, GripVertical, Plus, Trash2 } from "lucide-react";
import {
  createEventRundownRow,
  deleteEventRundownRow,
  downloadEventRundownReport,
  listEventRundown,
  reorderEventRundown,
  updateEventRundownRow,
} from "../api/eventRundown";
import { useAccess } from "../hooks/useAccess";
import Card from "../components/Card";

export default function EventRundown({ event: selectedEvent }) {
  const { canRead, canWrite } = useAccess("event.rundown");

  const [rows, setRows] = useState([]);
  const [isLoadingRows, setIsLoadingRows] = useState(true);

  const [reportFormat, setReportFormat] = useState("pdf");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState(null);

  async function loadRows() {
    if (!selectedEvent) return;
    setIsLoadingRows(true);
    const data = await listEventRundown(selectedEvent.id);
    setRows(data);
    setIsLoadingRows(false);
  }

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvent]);

  async function handleFieldChange(row, field, value) {
    setRows((current) => current.map((r) => (r.id === row.id ? { ...r, [field]: value } : r)));
  }

  async function handleSaveRow(row) {
    await updateEventRundownRow(selectedEvent.id, row.id, {
      time: row.time,
      activity: row.activity,
      highlight: row.highlight,
    });
    loadRows();
  }

  async function handleAddRow() {
    await createEventRundownRow(selectedEvent.id, { time: "", activity: "", highlight: false });
    loadRows();
  }

  async function handleDelete(row) {
    if (!window.confirm(`Delete this rundown row: "${row.activity}"?`)) return;
    await deleteEventRundownRow(selectedEvent.id, row.id);
    loadRows();
  }

  async function handleMove(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= rows.length) return;
    const reordered = [...rows];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    setRows(reordered);
    await reorderEventRundown(
      selectedEvent.id,
      reordered.map((row, i) => ({ id: row.id, sort_order: i })),
    );
    loadRows();
  }

  async function handleGenerateReport() {
    setIsGeneratingReport(true);
    setReportError(null);
    try {
      const { blob, filename } = await downloadEventRundownReport(selectedEvent.id, reportFormat);
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
      <div className="admin-page event-rundown-page">
        <h1>Run Down</h1>
        <p role="alert">You do not have permission to view the Run Down.</p>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page-wide event-rundown-page">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="m-0 text-2xl font-semibold text-[var(--text-h)]">Rundown</h1>
      </div>

      {selectedEvent && isLoadingRows && <p>Loading rundown…</p>}

      {selectedEvent && !isLoadingRows && (
        <>
          <div className="mb-4 flex items-end justify-between gap-3">
            <div className="flex items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="rundown-report-format"
                  className="pl-0.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]"
                >
                  Format
                </label>
                <select
                  id="rundown-report-format"
                  value={reportFormat}
                  onChange={(e) => setReportFormat(e.target.value)}
                  disabled={isGeneratingReport}
                  className="h-[38px] rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13.5px] text-[var(--ink)]"
                >
                  <option value="pdf">PDF</option>
                  <option value="csv">CSV</option>
                </select>
              </div>
              <button
                type="button"
                onClick={handleGenerateReport}
                disabled={isGeneratingReport}
                className="inline-flex h-[38px] items-center gap-[7px] rounded-[8px] border border-[var(--border)] bg-transparent px-[15px] text-[13.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--bg-alt)]"
              >
                <FileDown className="w-[15px] h-[15px]" aria-hidden="true" />
                {isGeneratingReport ? "Generating…" : "Generate Report"}
              </button>
            </div>
            {canWrite && selectedEvent && (
              <button
                type="button"
                onClick={handleAddRow}
                className="inline-flex h-[38px] items-center gap-[7px] rounded-[8px] bg-[var(--accent)] px-[15px] text-[13.5px] font-semibold text-white hover:bg-[var(--accent-ink)]"
              >
                <Plus className="w-[15px] h-[15px]" aria-hidden="true" />
                Add Row
              </button>
            )}
          </div>
          {reportError && <p role="alert">{reportError}</p>}

          <Card variant="default" className="flex flex-col gap-1 p-[10px_12px]">
            {rows.map((row, index) => (
              <div
                key={row.id}
                className={`flex items-center gap-[14px] rounded-[10px] p-3 ${
                  index % 2 === 1 ? "bg-[var(--color-border-light)]" : ""
                }`}
              >
                <GripVertical size={16} className="shrink-0 text-[var(--color-muted-text)] opacity-35" />
                <label className="sr-only" htmlFor={`rundown-time-${row.id}`}>
                  Time for row {index + 1}
                </label>
                <input
                  id={`rundown-time-${row.id}`}
                  aria-label={`Time for row ${index + 1}`}
                  value={row.time}
                  onChange={(e) => handleFieldChange(row, "time", e.target.value)}
                  disabled={!canWrite}
                  className="w-[70px] shrink-0 rounded-[8px] border border-transparent bg-transparent px-1 text-[13px] font-semibold text-[var(--text-h)] focus:border-[var(--color-border-medium)]"
                />
                <input
                  aria-label={`Activity for row ${index + 1}`}
                  value={row.activity}
                  onChange={(e) => handleFieldChange(row, "activity", e.target.value)}
                  disabled={!canWrite}
                  className="flex-1 rounded-[8px] border border-transparent bg-transparent px-1 text-[13px] text-[var(--text-h)] focus:border-[var(--color-border-medium)]"
                />
                <label className="flex items-center gap-1 text-[12px] text-[var(--color-muted-text)]">
                  <input
                    aria-label={`Highlight for row ${index + 1}`}
                    type="checkbox"
                    checked={row.highlight}
                    onChange={(e) => handleFieldChange(row, "highlight", e.target.checked)}
                    disabled={!canWrite}
                  />
                  Highlight
                </label>
                {canWrite && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleSaveRow(row)}
                      title="Save"
                      aria-label={`Save row ${index + 1}`}
                      className="event-iact"
                    >
                      <Check className="w-[14px] h-[14px]" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(index, -1)}
                      disabled={index === 0}
                      title="Move up"
                      aria-label={`Move row ${index + 1} up`}
                      className="event-iact"
                    >
                      <ArrowUp className="w-[14px] h-[14px]" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(index, 1)}
                      disabled={index === rows.length - 1}
                      title="Move down"
                      aria-label={`Move row ${index + 1} down`}
                      className="event-iact"
                    >
                      <ArrowDown className="w-[14px] h-[14px]" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(row)}
                      title="Delete"
                      aria-label={`Delete row ${index + 1}`}
                      className="event-iact event-iact-danger"
                    >
                      <Trash2 className="w-[14px] h-[14px]" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
