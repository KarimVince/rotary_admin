import { useEffect, useState } from "react";
import {
  deleteDinnerForecastEvent,
  downloadDinnerForecastReport,
  listDinnerForecastEvents,
} from "../api/dinnerForecast";
import { listMembers } from "../api/members";
import { useAccess } from "../hooks/useAccess";
import { currentRotaryYear, rotaryYearLabel } from "../utils/rotaryYear";
import DinnerForecastEventFormModal from "../components/DinnerForecastEventFormModal";

const EVENT_TYPE_LABEL = { dinner: "Dinner", fellowship: "Fellowship" };

export default function DinnerForecast() {
  const { canRead, canWrite } = useAccess("attendance.forecast");

  const [year, setYear] = useState(currentRotaryYear());
  const [yearOptions, setYearOptions] = useState(() =>
    Array.from(new Set([currentRotaryYear(), currentRotaryYear() + 1, currentRotaryYear() - 1])).sort(
      (a, b) => b - a,
    ),
  );
  const [events, setEvents] = useState([]);
  const [members, setMembers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);

  const [reportFormat, setReportFormat] = useState("pdf");
  const [reportEventType, setReportEventType] = useState("all");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState(null);

  async function loadData() {
    setIsLoading(true);
    setLoadError(null);
    try {
      const eventsData = await listDinnerForecastEvents({ rotary_year: year });
      setEvents(eventsData);
      setYearOptions((current) =>
        Array.from(new Set([...current, ...eventsData.map((event) => event.rotary_year)])).sort(
          (a, b) => b - a,
        ),
      );
    } catch (err) {
      setLoadError(err.detail || "Failed to load dinner forecast events");
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

  useEffect(() => {
    if (!canRead) return;
    listMembers()
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [canRead]);

  function speakerContactName(memberId) {
    const member = members.find((m) => m.id === memberId);
    return member ? `${member.first_name} ${member.last_name}` : "—";
  }

  function openCreate() {
    setEditingEvent(null);
    setIsFormOpen(true);
  }

  function openEdit(event) {
    setEditingEvent(event);
    setIsFormOpen(true);
  }

  function handleSaved() {
    setIsFormOpen(false);
    setEditingEvent(null);
    loadData();
  }

  async function handleDelete(event) {
    if (!window.confirm(`Delete "${event.name}" on ${event.event_date}?`)) return;
    await deleteDinnerForecastEvent(event.id);
    loadData();
  }

  async function handleGenerateReport() {
    setIsGeneratingReport(true);
    setReportError(null);
    try {
      const { blob, filename } = await downloadDinnerForecastReport({
        rotary_year: year,
        format: reportFormat,
        event_type: reportEventType,
      });
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
      <div className="admin-page dinner-events-page">
        <h1>Dinner Events</h1>
        <p role="alert">You do not have permission to view Dinner Events.</p>
      </div>
    );
  }

  return (
    <div className="admin-page dinner-events-page">
      <div className="page-header-row">
        <h1>Dinner Events</h1>
        {canWrite && (
          <button type="button" className="btn-add-member" onClick={openCreate}>
            New Dinner Event
          </button>
        )}
      </div>

      <div>
        <label htmlFor="forecast-year" className="fee-year-label">
          Rotary year
        </label>
        <select
          id="forecast-year"
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

      <div className="report-controls">
        <label htmlFor="forecast-report-type">Event filter</label>
        <select
          id="forecast-report-type"
          value={reportEventType}
          onChange={(event) => setReportEventType(event.target.value)}
          disabled={isGeneratingReport}
        >
          <option value="all">All events</option>
          <option value="dinner">Dinners only</option>
          <option value="fellowship">Fellowships only</option>
        </select>

        <label htmlFor="forecast-report-format">Format</label>
        <select
          id="forecast-report-format"
          value={reportFormat}
          onChange={(event) => setReportFormat(event.target.value)}
          disabled={isGeneratingReport}
        >
          <option value="pdf">PDF</option>
          <option value="csv">CSV</option>
        </select>

        <button
          type="button"
          className="btn-add-member"
          onClick={handleGenerateReport}
          disabled={isGeneratingReport}
        >
          {isGeneratingReport ? "Generating…" : "Generate Report"}
        </button>
      </div>
      {reportError && <p role="alert">{reportError}</p>}

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && events.length === 0 && (
        <p className="member-empty-state">No dinner events planned for {rotaryYearLabel(year)} yet.</p>
      )}

      {!isLoading && !loadError && events.length > 0 && (
        <div className="dinner-events-table-wrap">
          <table className="admin-table dinner-events-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Event Name</th>
                <th>Location</th>
                <th>Speaker</th>
                <th>Speaker Rotary Contact</th>
                <th>NGO-Org</th>
                <th>Member Only</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="dinner-events-date-cell">{event.event_date}</td>
                  <td>
                    <span className={`attendance-type-badge attendance-type-${event.event_type}`}>
                      {EVENT_TYPE_LABEL[event.event_type]}
                    </span>
                  </td>
                  <td>{event.name}</td>
                  <td>{event.location}</td>
                  <td>{event.speaker_name || "—"}</td>
                  <td>
                    {event.speaker_rotary_contact_member_id
                      ? speakerContactName(event.speaker_rotary_contact_member_id)
                      : "—"}
                  </td>
                  <td>{event.ngo_organisation_name || "—"}</td>
                  <td>{event.member_only ? "Yes" : "No"}</td>
                  <td>
                    {canWrite && (
                      <>
                        <button type="button" onClick={() => openEdit(event)}>
                          Edit
                        </button>
                        <button type="button" onClick={() => handleDelete(event)}>
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isFormOpen && (
        <DinnerForecastEventFormModal
          event={editingEvent}
          members={members}
          onClose={() => setIsFormOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
