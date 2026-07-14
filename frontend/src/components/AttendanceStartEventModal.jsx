import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { startAttendanceForEvent } from "../api/attendance";
import { listDinnerForecastEvents } from "../api/dinnerForecast";
import { currentRotaryYear, rotaryYearLabel } from "../utils/rotaryYear";

const EVENT_TYPE_LABEL = { dinner: "Dinner", fellowship: "Fellowship" };

export default function AttendanceStartEventModal({ onClose, onStarted }) {
  const [year, setYear] = useState(currentRotaryYear());
  const [yearOptions] = useState(() =>
    Array.from(new Set([currentRotaryYear(), currentRotaryYear() - 1])).sort((a, b) => b - a),
  );
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState(null);

  useEffect(() => {
    setIsLoading(true);
    setLoadError(null);
    listDinnerForecastEvents({ rotary_year: year, unstarted_only: true })
      .then((data) => {
        setEvents(data);
        setSelectedEventId(data[0]?.id || "");
      })
      .catch((err) => setLoadError(err.detail || "Failed to load dinner events"))
      .finally(() => setIsLoading(false));
  }, [year]);

  async function handleStart(e) {
    e.preventDefault();
    if (!selectedEventId) return;
    setIsStarting(true);
    setStartError(null);
    try {
      const started = await startAttendanceForEvent(selectedEventId);
      onStarted(started);
    } catch (err) {
      setStartError(err.detail || "Failed to start attendance for this event");
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(event_) => event_.stopPropagation()}>
        <form onSubmit={handleStart}>
          <h2>New event</h2>

          <label htmlFor="start-event-year" className="fee-year-label">
            Rotary year
          </label>
          <select
            id="start-event-year"
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

          {isLoading && <p>Loading…</p>}
          {loadError && <p role="alert">{loadError}</p>}

          {!isLoading && !loadError && events.length === 0 && (
            <p className="member-empty-state">
              No dinner events found. Please create an event in the{" "}
              <Link to="/dinners/forecast" onClick={onClose}>
                Dinner Events
              </Link>{" "}
              page first.
            </p>
          )}

          {!isLoading && !loadError && events.length > 0 && (
            <div className="member-form-grid">
              <div className="field-full">
                <label htmlFor="start-event-select">Event</label>
                <select
                  id="start-event-select"
                  value={selectedEventId}
                  onChange={(event) => setSelectedEventId(event.target.value)}
                  required
                >
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.event_date} — {event.name} ({EVENT_TYPE_LABEL[event.event_type]})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {startError && <p role="alert">{startError}</p>}

          <div className="modal-actions">
            {!isLoading && !loadError && events.length > 0 && (
              <button type="submit" disabled={isStarting}>
                {isStarting ? "Starting…" : "Start attendance"}
              </button>
            )}
            <button type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
