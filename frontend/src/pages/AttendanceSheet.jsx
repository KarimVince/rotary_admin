import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  deleteAttendanceEvent,
  fetchAttendanceSheet,
  updateAttendanceRecord,
} from "../api/attendance";
import { useAccess } from "../hooks/useAccess";
import AttendanceEventFormModal from "../components/AttendanceEventFormModal";

const EVENT_TYPE_LABEL = { dinner: "Dinner", fellowship: "Fellowship" };
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

  function togglePastExpanded() {
    setIsPastExpanded((current) => {
      const next = !current;
      localStorage.setItem(PAST_SECTION_STORAGE_KEY, String(next));
      return next;
    });
  }

  async function handleToggle(section, member) {
    if (!canWrite) return;
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
      navigate("/dinners/attendance");
    } catch (err) {
      setLoadError(err.detail || "Failed to delete event");
    }
  }

  function renderSection(title, section) {
    const members = sheet[section];
    if (members.length === 0) return null;
    return (
      <section>
        <h2>
          {title} ({members.length})
        </h2>
        <ul className="attendance-member-list">
          {members.map((member) => (
            <li key={member.member_id} className="attendance-member-row">
              <label>
                <input
                  type="checkbox"
                  checked={member.present}
                  disabled={!canWrite}
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
      <div className="email-controls-row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>{sheet.event.name}</h1>
          <p>
            {sheet.event.event_date} —{" "}
            <span className={`attendance-type-badge attendance-type-${sheet.event.event_type}`}>
              {EVENT_TYPE_LABEL[sheet.event.event_type]}
            </span>
          </p>
        </div>
        {canWrite && (
          <div className="modal-actions">
            <button type="button" onClick={() => setIsEditOpen(true)}>
              Edit
            </button>
            <button type="button" onClick={handleDelete}>
              Delete
            </button>
          </div>
        )}
      </div>

      <p>
        <strong>
          {counts.present} / {counts.eligible}
        </strong>{" "}
        present ({counts.percentage}%)
      </p>

      {renderSection("Active members", "active")}
      {renderSection("Honorary members", "honorary")}

      {sheet.past.length > 0 && (
        <section>
          <button type="button" onClick={togglePastExpanded} aria-expanded={isPastExpanded}>
            {isPastExpanded ? "▾" : "▸"} Past Members ({sheet.past.length})
          </button>
          {isPastExpanded && renderSection("Past members", "past")}
        </section>
      )}

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
