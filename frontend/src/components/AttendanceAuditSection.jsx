import { useEffect, useRef, useState } from "react";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import {
  deleteAttendanceAudit,
  downloadAttendanceAudit,
  listAttendanceAudits,
  uploadAttendanceAudit,
} from "../api/attendanceAudit";
import { useAccess } from "../hooks/useAccess";

const ACCEPTED_EXTENSIONS = ".pdf,.jpg,.jpeg,.png";

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

// 2026-08-14 — the completed, filled-in attendance sheet (Story 16.33's
// fillable PDF, marked up during/after the meeting) stored back against the
// event as its permanent audit record. Self-gates on "attendance.sheet"
// (same key as the parent page) rather than a dedicated key, since this is
// just another facet of the Attendance Sheet feature, not a separate module.
export default function AttendanceAuditSection({ eventId }) {
  const { canRead, canWrite } = useAccess("attendance.sheet");

  const [audits, setAudits] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const [rowError, setRowError] = useState({});
  const [busyId, setBusyId] = useState(null);

  const fileInputRef = useRef(null);

  async function loadAudits() {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await listAttendanceAudits(eventId);
      setAudits(data);
    } catch (err) {
      setLoadError(err.detail || "Failed to load the audit log");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    loadAudits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, canRead]);

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      await uploadAttendanceAudit(eventId, file);
      await loadAudits();
    } catch (err) {
      setUploadError(err.detail || "Failed to save the completed sheet");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete(auditId) {
    if (!window.confirm("Delete this audit record? This cannot be undone.")) return;
    setBusyId(auditId);
    try {
      await deleteAttendanceAudit(eventId, auditId);
      await loadAudits();
    } catch (err) {
      setRowError((current) => ({
        ...current,
        [auditId]: err.detail || "Failed to delete this record",
      }));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDownload(audit) {
    setRowError((current) => ({ ...current, [audit.id]: null }));
    try {
      const { blob, filename } = await downloadAttendanceAudit(eventId, audit.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = audit.file_original_filename || filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setRowError((current) => ({
        ...current,
        [audit.id]: err.detail || "Failed to download this file",
      }));
    }
  }

  if (!canRead) return null;

  return (
    <section className="mt-6 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-[16px_18px]">
      <div className="mb-3.5 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[.12em] text-[var(--faint)]">
          Audit Log — Completed Sheet
        </span>
        {canWrite && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              className="hidden"
              onChange={handleUpload}
              aria-label="Save completed attendance sheet"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="inline-flex items-center gap-[6px] rounded-[8px] bg-[var(--color-brand-blue)] px-3 py-[6px] text-[12px] font-semibold text-white disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              {isUploading ? "Saving…" : "Save Completed Sheet"}
            </button>
          </>
        )}
      </div>
      <p className="mb-3 text-[11px] text-[var(--color-muted-text)]">
        Once the meeting is over and the sheet has been filled in (printed and scanned, or filled
        digitally), save it here as the event's permanent audit record. PDF, JPG, or PNG, up to
        10MB.
      </p>

      {isLoading && <p className="text-[13px] text-[var(--color-muted-text)]">Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}
      {uploadError && <p role="alert">{uploadError}</p>}

      {!isLoading && !loadError && audits.length === 0 && (
        <p className="member-empty-state">No completed sheet saved yet.</p>
      )}

      {!isLoading && !loadError && audits.length > 0 && (
        <ul className="flex list-none flex-col gap-3 p-0 m-0">
          {audits.map((audit) => (
            <li key={audit.id} className="rounded-[10px] border border-[var(--color-border-faint)] p-3">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleDownload(audit)}
                  className="flex items-center gap-2 bg-transparent p-0 text-[13px] font-semibold text-[var(--color-brand-blue)]"
                >
                  <FileText className="w-4 h-4" aria-hidden="true" />
                  {audit.file_original_filename}
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => handleDelete(audit.id)}
                    disabled={busyId === audit.id}
                    title="Delete this record"
                    aria-label="Delete this record"
                    className="grid h-[28px] w-[28px] place-items-center rounded-[7px] !bg-transparent text-[var(--muted)] hover:!bg-[var(--low-bg)] hover:text-[var(--low)]"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="mt-2 text-[11px] text-[var(--color-muted-text)]">
                Saved by {audit.uploaded_by_name || "—"} · {formatDateTime(audit.uploaded_at)}
              </div>
              {rowError[audit.id] && <p role="alert">{rowError[audit.id]}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
