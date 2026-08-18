import { useEffect, useRef, useState } from "react";
import { Download, FileText, Pencil, Trash2 } from "lucide-react";
import {
  createFileMinutes,
  createTextMinutes,
  deleteEventMinutes,
  downloadEventMinutesFile,
  listEventMinutes,
  replaceFileMinutes,
  updateTextMinutes,
} from "../api/eventMinutes";
import { useAccess } from "../hooks/useAccess";

const ACCEPTED_EXTENSIONS = ".doc,.docx,.pdf";

function formatDateTime(isoString) {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function LastEdited({ minutes }) {
  return (
    <span className="text-[11px] text-[var(--color-muted-text)]">
      Last edited by {minutes.last_updated_by_name || "—"} · {formatDateTime(minutes.last_updated_at)}
    </span>
  );
}

// Story 16.29 — Dinner/Event Minutes. Self-gates on its own permission-matrix
// key ("attendance.minutes") rather than trusting the parent page's access
// level, so it hides entirely for a No Access user even if embedded on a
// page gated by a different key.
export default function EventMinutesSection({ eventId }) {
  const { canRead, canWrite } = useAccess("attendance.minutes");

  const [minutesList, setMinutesList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [isAdding, setIsAdding] = useState(false);
  const [addMode, setAddMode] = useState("text");
  const [addText, setAddText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  const [rowError, setRowError] = useState({});
  const [busyId, setBusyId] = useState(null);

  const addFileInputRef = useRef(null);
  const replaceFileInputRef = useRef({});

  async function loadMinutes() {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await listEventMinutes(eventId);
      setMinutesList(data);
    } catch (err) {
      setLoadError(err.detail || "Failed to load minutes");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    loadMinutes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, canRead]);

  function openAdd() {
    setIsAdding(true);
    setAddMode("text");
    setAddText("");
    setSaveError(null);
  }

  function cancelAdd() {
    setIsAdding(false);
    setSaveError(null);
  }

  async function handleAddText(event) {
    event.preventDefault();
    if (!addText.trim()) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await createTextMinutes(eventId, addText.trim());
      setIsAdding(false);
      await loadMinutes();
    } catch (err) {
      setSaveError(err.detail || "Failed to save minutes");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await createFileMinutes(eventId, file);
      setIsAdding(false);
      await loadMinutes();
    } catch (err) {
      setSaveError(err.detail || "Failed to upload minutes file");
    } finally {
      setIsSaving(false);
    }
  }

  function startEditText(minutes) {
    setEditingId(minutes.id);
    setEditText(minutes.content_text || "");
    setRowError((current) => ({ ...current, [minutes.id]: null }));
  }

  function cancelEditText() {
    setEditingId(null);
  }

  async function handleSaveEditText(minutesId) {
    if (!editText.trim()) return;
    setBusyId(minutesId);
    try {
      await updateTextMinutes(eventId, minutesId, editText.trim());
      setEditingId(null);
      await loadMinutes();
    } catch (err) {
      setRowError((current) => ({
        ...current,
        [minutesId]: err.detail || "Failed to update minutes",
      }));
    } finally {
      setBusyId(null);
    }
  }

  async function handleReplaceFile(minutesId, event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusyId(minutesId);
    setRowError((current) => ({ ...current, [minutesId]: null }));
    try {
      await replaceFileMinutes(eventId, minutesId, file);
      await loadMinutes();
    } catch (err) {
      setRowError((current) => ({
        ...current,
        [minutesId]: err.detail || "Failed to replace file",
      }));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(minutesId) {
    if (!window.confirm("Delete these minutes? This cannot be undone.")) return;
    setBusyId(minutesId);
    try {
      await deleteEventMinutes(eventId, minutesId);
      await loadMinutes();
    } catch (err) {
      setRowError((current) => ({
        ...current,
        [minutesId]: err.detail || "Failed to delete minutes",
      }));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDownload(minutes) {
    setRowError((current) => ({ ...current, [minutes.id]: null }));
    try {
      const { blob, filename } = await downloadEventMinutesFile(eventId, minutes.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = minutes.file_original_filename || filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setRowError((current) => ({
        ...current,
        [minutes.id]: err.detail || "Failed to download file",
      }));
    }
  }

  if (!canRead) return null;

  return (
    <section className="mt-6 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-[16px_18px]">
      <div className="mb-3.5 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[.12em] text-[var(--faint)]">
          Minutes
        </span>
        {canWrite && !isAdding && (
          <button
            type="button"
            onClick={openAdd}
            className="rounded-[8px] bg-[var(--color-brand-blue)] px-3 py-[6px] text-[12px] font-semibold text-white"
          >
            Add Minutes
          </button>
        )}
      </div>

      {isLoading && <p className="text-[13px] text-[var(--color-muted-text)]">Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && minutesList.length === 0 && !isAdding && (
        <p className="member-empty-state">No minutes recorded yet.</p>
      )}

      {isAdding && (
        <div className="mb-4 rounded-[10px] border border-[var(--color-border-faint)] p-3">
          <div className="mb-2 flex gap-2">
            <button
              type="button"
              onClick={() => setAddMode("text")}
              className={`rounded-[7px] px-3 py-1 text-[12px] font-semibold ${
                addMode === "text"
                  ? "bg-[var(--color-brand-blue)] text-white"
                  : "bg-[var(--tone-blue-bg)] text-[var(--color-brand-blue)]"
              }`}
            >
              Paste Text
            </button>
            <button
              type="button"
              onClick={() => setAddMode("file")}
              className={`rounded-[7px] px-3 py-1 text-[12px] font-semibold ${
                addMode === "file"
                  ? "bg-[var(--color-brand-blue)] text-white"
                  : "bg-[var(--tone-blue-bg)] text-[var(--color-brand-blue)]"
              }`}
            >
              Upload File
            </button>
          </div>

          {addMode === "text" ? (
            <form onSubmit={handleAddText} className="flex flex-col gap-2">
              <textarea
                value={addText}
                onChange={(event) => setAddText(event.target.value)}
                rows={6}
                placeholder="Paste or type the minutes here…"
                className="w-full rounded-[8px] border border-[var(--color-border-faint)] p-2 text-[13px]"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isSaving || !addText.trim()}
                  className="rounded-[8px] bg-[var(--color-brand-blue)] px-3 py-[6px] text-[12px] font-semibold text-white disabled:opacity-50"
                >
                  {isSaving ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={cancelAdd}
                  className="rounded-[8px] bg-transparent px-3 py-[6px] text-[12px] font-semibold text-[var(--color-muted-text)]"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-col gap-2">
              <input
                ref={addFileInputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                onChange={handleAddFile}
                disabled={isSaving}
                aria-label="Upload minutes file"
              />
              <p className="text-[11px] text-[var(--color-muted-text)]">
                Word (.doc/.docx) or PDF, up to 5MB.
              </p>
              <button
                type="button"
                onClick={cancelAdd}
                className="w-fit rounded-[8px] bg-transparent px-3 py-[6px] text-[12px] font-semibold text-[var(--color-muted-text)]"
              >
                Cancel
              </button>
            </div>
          )}
          {saveError && <p role="alert">{saveError}</p>}
        </div>
      )}

      {!isLoading && !loadError && minutesList.length > 0 && (
        <ul className="flex list-none flex-col gap-3 p-0 m-0">
          {minutesList.map((minutes) => (
            <li
              key={minutes.id}
              className="rounded-[10px] border border-[var(--color-border-faint)] p-3"
            >
              {minutes.minutes_type === "text" ? (
                editingId === minutes.id ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={editText}
                      onChange={(event) => setEditText(event.target.value)}
                      rows={6}
                      className="w-full rounded-[8px] border border-[var(--color-border-faint)] p-2 text-[13px]"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleSaveEditText(minutes.id)}
                        disabled={busyId === minutes.id || !editText.trim()}
                        className="rounded-[8px] bg-[var(--color-brand-blue)] px-3 py-[6px] text-[12px] font-semibold text-white disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditText}
                        className="rounded-[8px] bg-transparent px-3 py-[6px] text-[12px] font-semibold text-[var(--color-muted-text)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="m-0 whitespace-pre-wrap text-[13px] text-[var(--text)]">
                      {minutes.content_text}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <LastEdited minutes={minutes} />
                      {canWrite && (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => startEditText(minutes)}
                            title="Edit minutes"
                            aria-label="Edit minutes"
                            className="grid h-[28px] w-[28px] place-items-center rounded-[7px] !bg-transparent text-[var(--muted)] hover:!bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                          >
                            <Pencil className="w-4 h-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(minutes.id)}
                            disabled={busyId === minutes.id}
                            title="Delete minutes"
                            aria-label="Delete minutes"
                            className="grid h-[28px] w-[28px] place-items-center rounded-[7px] !bg-transparent text-[var(--muted)] hover:!bg-[var(--low-bg)] hover:text-[var(--low)]"
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => handleDownload(minutes)}
                      className="flex items-center gap-2 bg-transparent p-0 text-[13px] font-semibold text-[var(--color-brand-blue)]"
                    >
                      <FileText className="w-4 h-4" aria-hidden="true" />
                      {minutes.file_original_filename}
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    {canWrite && (
                      <div className="flex gap-1">
                        <input
                          ref={(el) => {
                            replaceFileInputRef.current[minutes.id] = el;
                          }}
                          type="file"
                          accept={ACCEPTED_EXTENSIONS}
                          className="hidden"
                          onChange={(event) => handleReplaceFile(minutes.id, event)}
                          aria-label="Replace minutes file"
                        />
                        <button
                          type="button"
                          onClick={() => replaceFileInputRef.current[minutes.id]?.click()}
                          disabled={busyId === minutes.id}
                          title="Replace file"
                          aria-label="Replace file"
                          className="grid h-[28px] w-[28px] place-items-center rounded-[7px] !bg-transparent text-[var(--muted)] hover:!bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                        >
                          <Pencil className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(minutes.id)}
                          disabled={busyId === minutes.id}
                          title="Delete minutes"
                          aria-label="Delete minutes"
                          className="grid h-[28px] w-[28px] place-items-center rounded-[7px] !bg-transparent text-[var(--muted)] hover:!bg-[var(--low-bg)] hover:text-[var(--low)]"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="mt-2">
                    <LastEdited minutes={minutes} />
                  </div>
                </>
              )}
              {rowError[minutes.id] && <p role="alert">{rowError[minutes.id]}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
