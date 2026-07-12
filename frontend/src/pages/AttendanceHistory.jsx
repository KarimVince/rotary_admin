import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAttendanceStats, listAttendanceEvents } from "../api/attendance";
import { useAccess } from "../hooks/useAccess";
import { currentRotaryYear, rotaryYearLabel } from "../utils/rotaryYear";
import { attendanceColorClass } from "../utils/attendanceThresholds";
import AttendanceEventFormModal from "../components/AttendanceEventFormModal";

const EVENT_TYPE_LABEL = { dinner: "Dinner", fellowship: "Fellowship" };

export default function AttendanceHistory() {
  const navigate = useNavigate();
  const { canRead } = useAccess("attendance.history");
  const { canWrite } = useAccess("attendance.sheet");

  const [year, setYear] = useState(currentRotaryYear());
  const [yearOptions, setYearOptions] = useState(() =>
    Array.from(new Set([currentRotaryYear(), currentRotaryYear() - 1])).sort((a, b) => b - a),
  );
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  async function loadData() {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [eventsData, statsData] = await Promise.all([
        listAttendanceEvents({ rotary_year: year }),
        fetchAttendanceStats({ rotary_year: year }),
      ]);
      setEvents(eventsData);
      setStats(statsData);
      setYearOptions((current) =>
        Array.from(new Set([...current, ...eventsData.map((event) => event.rotary_year)])).sort(
          (a, b) => b - a,
        ),
      );
    } catch (err) {
      setLoadError(err.detail || "Failed to load attendance history");
    } finally {
      setIsLoading(false);
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

  function handleEventCreated(event) {
    setIsCreateOpen(false);
    navigate(`/dinners/attendance/${event.id}`);
  }

  if (!canRead) {
    return (
      <div className="admin-page">
        <h1>Attendance</h1>
        <p role="alert">You do not have permission to view attendance history.</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="page-header-row">
        <h1>Attendance</h1>
        {canWrite && (
          <button type="button" className="btn-add-member" onClick={() => setIsCreateOpen(true)}>
            New Event
          </button>
        )}
      </div>

      <div>
        <label htmlFor="attendance-year" className="fee-year-label">
          Rotary year
        </label>
        <select
          id="attendance-year"
          className="fee-year-select"
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
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && stats && (
        <div className="stat-cards-row-3">
          <div className="stat-card">
            <span className="stat-value">{stats.total_events}</span>
            <span className="stat-label">Total events — {rotaryYearLabel(year)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.average_attendance ?? "—"}</span>
            <span className="stat-label">
              Average attendance
              {stats.eligible_member_count
                ? ` — out of ${stats.eligible_member_count} members`
                : ""}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-value">
              {stats.average_attendance_percentage === null
                ? "—"
                : `${stats.average_attendance_percentage}%`}
            </span>
            <span className="stat-label">Average attendance %</span>
          </div>
        </div>
      )}

      {!isLoading && !loadError && events.length === 0 && (
        <p className="member-empty-state">No events recorded for {rotaryYearLabel(year)} yet.</p>
      )}

      {!isLoading && !loadError && events.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Attendance</th>
              <th>Date</th>
              <th>Event</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr
                key={event.id}
                className="attendance-history-row"
                onClick={() => navigate(`/dinners/attendance/${event.id}`)}
                title={`Active present: ${event.active_present}, Honorary present: ${event.honorary_present}, Past present: ${event.past_present}`}
                style={{ cursor: "pointer" }}
              >
                <td>
                  <span className={`attendance-badge ${attendanceColorClass(event.attendance_percentage)}`}>
                    {event.present_count} / {event.eligible_total}
                    {"  "}
                    {event.attendance_percentage}%
                  </span>
                </td>
                <td>{event.event_date}</td>
                <td>{event.name}</td>
                <td>
                  <span className={`attendance-type-badge attendance-type-${event.event_type}`}>
                    {EVENT_TYPE_LABEL[event.event_type]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {isCreateOpen && (
        <AttendanceEventFormModal
          onClose={() => setIsCreateOpen(false)}
          onSaved={handleEventCreated}
        />
      )}
    </div>
  );
}
