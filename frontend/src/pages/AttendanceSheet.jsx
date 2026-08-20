import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  deleteAttendanceEvent,
  downloadAttendanceSheetPdf,
  fetchAttendanceSheet,
  refreshAttendanceList,
  updateAttendanceRecord,
} from "../api/attendance";
import { useAccess } from "../hooks/useAccess";
import { isFutureEventDate } from "../utils/eventDate";
import { formatDate } from "../utils/formatters";
import AttendanceEventFormModal from "../components/AttendanceEventFormModal";
import EventMinutesSection from "../components/EventMinutesSection";

const PAST_SECTION_STORAGE_KEY = "attendance-sheet-past-expanded";

function memberLabel(member) {
  return `${member.first_name} ${member.last_name}`;
}

export default function AttendanceSheet() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { canRead } = useAccess("attendance.sheet");
  const { canWrite } = useAccess("attendance.sheet");

  const [sheet, setSheet] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [toggleErrors, setToggleErrors] = useState({});
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPastExpanded, setIsPastExpanded] = useState(
    () => localStorage.getItem(PAST_SECTION_STORAGE_KEY) === "true",
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [generatePdfError, setGeneratePdfError] = useState(null);

  async function loadSheet() {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await fetchAttendanceSheet(eventId);
      setSheet(data);
    } catch (err) {
      setLoadError(err.detail || "Failed to load attendance sheet");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    loadSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, canRead]);

  const counts = useMemo(() => {
    if (!sheet) return { present: 0, eligible: 0, percentage: 0 };
    return {
      present: sheet.present_count,
      eligible: sheet.eligible_total,
      percentage: sheet.attendance_percentage,
    };
  }, [sheet]);

  // Story 16.9: a future-dated event's attendance is display-only-hidden,
  // not blocked at the data layer — pre-saved marks stay intact, they're
  // just not surfaced (or editable) until the event date has passed.
  const isFuture = Boolean(sheet) && isFutureEventDate(sheet.event.event_date);

  function togglePastExpanded() {
    setIsPastExpanded((current) => {
      const next = !current;
      localStorage.setItem(PAST_SECTION_STORAGE_KEY, String(next));
      return next;
    });
  }

  async function handleToggle(section, member) {
    if (!canWrite || isFuture) return;
    const nextPresent = !member.present;

    // Optimistic UI (Story 10.4): flip the checkbox and recompute the
    // header counts immediately, then reconcile with the server response.
    setSheet((current) => {
      const updatedSection = current[section].map((m) =>
        m.member_id === member.member_id ? { ...m, present: nextPresent } : m,
      );
      const next = { ...current, [section]: updatedSection };
      const delta = nextPresent ? 1 : -1;
      next.present_count = current.present_count + delta;
      next.attendance_percentage = next.eligible_total
        ? Math.round((next.present_count / next.eligible_total) * 1000) / 10
        : 0;
      return next;
    });
    setToggleErrors((current) => ({ ...current, [member.member_id]: null }));

    try {
      await updateAttendanceRecord(eventId, member.member_id, nextPresent);
    } catch (err) {
      // Revert on failure.
      setSheet((current) => {
        const updatedSection = current[section].map((m) =>
          m.member_id === member.member_id ? { ...m, present: member.present } : m,
        );
        const next = { ...current, [section]: updatedSection };
        const delta = member.present ? 1 : -1;
        next.present_count = current.present_count + delta;
        next.attendance_percentage = next.eligible_total
          ? Math.round((next.present_count / next.eligible_total) * 1000) / 10
          : 0;
        return next;
      });
      setToggleErrors((current) => ({
        ...current,
        [member.member_id]: err.detail || "Failed to update attendance",
      }));
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${sheet.event.name}"? This cannot be undone.`)) return;
    try {
      await deleteAttendanceEvent(eventId);
      navigate("/dinners");
    } catch (err) {
      setLoadError(err.detail || "Failed to delete event");
    }
  }

  // Story 16.33 — same blob-download dance as DinnerEvents.jsx's Generate
  // Report button.
  async function handleGenerateAttendanceSheetPdf() {
    setIsGeneratingPdf(true);
    setGeneratePdfError(null);
    try {
      const { blob, filename } = await downloadAttendanceSheetPdf(eventId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setGeneratePdfError(err.detail || "Failed to generate the attendance sheet");
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  async function handleRefresh() {
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      const data = await refreshAttendanceList(eventId);
      setSheet(data);
    } catch (err) {
      setRefreshError(err.detail || "Failed to refresh the member list");
    } finally {
      setIsRefreshing(false);
    }
  }

  function renderSection(title, section) {
    const members = sheet[section];
    if (members.length === 0) return null;
    return (
      <section className="mb-5" style={isFuture ? { opacity: 0.5 } : undefined}>
        <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.03em] text-[var(--text-h)]">
          {title} ({members.length})
        </h2>
        <ul className="flex list-none flex-col gap-[3px] p-0 m-0">
          {members.map((member, index) => (
            <li
              key={member.member_id}
              className="rounded-[10px] px-3 py-[9px]"
              style={{ background: index % 2 === 0 ? "#fff" : "#f6f8fb" }}
            >
              <label className="flex items-center gap-2 text-[13px] text-[var(--text-h)]">
                <input
                  type="checkbox"
                  checked={member.present}
                  disabled={!canWrite || isFuture}
                  onChange={() => handleToggle(section, member)}
                  aria-label={`Mark ${memberLabel(member)} present`}
                />
                {memberLabel(member)}
              </label>
              {toggleErrors[member.member_id] && (
                <span role="alert">{toggleErrors[member.member_id]}</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>Attendance sheet</h1>
        <p role="alert">You do not have permission to view this attendance sheet.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="admin-page">
        <p>Loading…</p>
      </div>
    );
  }

  if (loadError || !sheet) {
    return (
      <div className="admin-page">
        <p role="alert">{loadError || "Event not found"}</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <Link
        to="/dinners"
        className="mb-3 inline-block text-[12px] font-semibold text-[var(--color-brand-blue)] no-underline"
      >
        ← Dinner / Events
      </Link>

      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="m-0 text-[22px] font-semibold text-[var(--text-h)]">{sheet.event.name}</h1>
          <p className="mt-1 text-[13px] text-[var(--color-muted-text)]">
            {formatDate(sheet.event.event_date)} · {sheet.event.location || "—"}
          </p>
        </div>
        <div className="flex gap-2">
          {/* Story 16.33 — read access is enough to download this (matches
              the Dinner Forecast report's own "read"-gated Generate Report
              button), so it's outside the canWrite block below. */}
          <button
            type="button"
            onClick={handleGenerateAttendanceSheetPdf}
            disabled={isGeneratingPdf}
            className="rounded-[9px] border border-[var(--color-brand-blue)] bg-white px-[14px] py-2 text-[13px] font-semibold text-[var(--color-brand-blue)]"
          >
            {isGeneratingPdf ? "Generating…" : "Generate Attendance Sheet"}
          </button>
          {canWrite && (
            <>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="rounded-[9px] bg-[var(--color-brand-blue)] px-[14px] py-2 text-[13px] font-semibold text-white"
            >
              {isRefreshing ? "Refreshing…" : "Refresh List"}
            </button>
            <button
              type="button"
              onClick={() => setIsEditOpen(true)}
              className="rounded-[9px] bg-[var(--color-brand-blue)] px-[14px] py-2 text-[13px] font-semibold text-white"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-[9px] bg-[var(--tone-rose-bg)] px-[14px] py-2 text-[13px] font-semibold text-[var(--color-tone-rose-text)]"
            >
              Delete
            </button>
            </>
          )}
        </div>
      </div>
      {refreshError && <p role="alert">{refreshError}</p>}
      {generatePdfError && <p role="alert">{generatePdfError}</p>}

      {isFuture ? (
        <div className="mb-5 rounded-xl bg-[var(--tone-amber-bg)] px-4 py-3 text-[13px] font-semibold text-[var(--color-tone-amber-text)]">
          This event hasn't taken place yet. Attendance will be available from{" "}
          {formatDate(sheet.event.event_date)}.
        </div>
      ) : (
        <div className="mb-5 inline-flex items-baseline gap-2 rounded-[14px] bg-[var(--tone-teal-bg)] px-[18px] py-[14px]">
          <span className="text-[22px] font-bold text-[var(--color-tone-teal-text)]">
            {counts.present} / {counts.eligible}
          </span>
          <span className="text-[13px] text-[var(--text)]">present ({counts.percentage}%)</span>
        </div>
      )}

      {/* A slightly-off-white card background so the row list reads as one
          distinct panel instead of blending straight into the page — the
          alternating white/light-grey rows previously sat directly on the
          page's own white background with nothing to set them apart. */}
      <div className="rounded-2xl bg-[#eef2f8] p-4">
        {renderSection("Active members", "active")}
        {renderSection("Honorary members", "honorary")}

        {sheet.past.length > 0 && (
          <section>
            <button
              type="button"
              onClick={togglePastExpanded}
              aria-expanded={isPastExpanded}
              className="rounded-[9px] bg-[var(--color-brand-blue)] px-[14px] py-2 text-[13px] font-semibold text-white"
            >
              {isPastExpanded ? "▾" : "▸"} Past Members ({sheet.past.length})
            </button>
            {isPastExpanded && renderSection("Past members", "past")}
          </section>
        )}
      </div>

      <EventMinutesSection eventId={eventId} />

      {isEditOpen && (
        <AttendanceEventFormModal
          event={sheet.event}
          onClose={() => setIsEditOpen(false)}
          onSaved={() => {
            setIsEditOpen(false);
            loadSheet();
          }}
        />
      )}
    </div>
  );
}
