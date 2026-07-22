import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deleteDinnerForecastEvent,
  downloadDinnerForecastReport,
  listDinnerForecastEvents,
} from "../api/dinnerForecast";
import { fetchAttendanceStats, startAttendanceForEvent } from "../api/attendance";
import { listDinnerEventTypes } from "../api/dinnerEventTypes";
import { listMembers } from "../api/members";
import { useAccess } from "../hooks/useAccess";
import { currentRotaryYear, rotaryYearLabel } from "../utils/rotaryYear";
import { todayInHongKong } from "../utils/eventDate";
import { downloadIcs, slugify } from "../utils/ics";
import DinnerForecastEventFormModal from "../components/DinnerForecastEventFormModal";
import MonthCard, { groupEventsByMonth, monthLabel } from "../components/DinnerMonthCard";

// Rotary year runs Jul -> Jun; returns the 12 "YYYY-MM" keys in that order
// so month cards render Jul first, Jun last, regardless of calendar order.
function rotaryYearMonthKeys(year) {
  const keys = [];
  for (let m = 7; m <= 12; m++) keys.push(`${year}-${String(m).padStart(2, "0")}`);
  for (let m = 1; m <= 6; m++) keys.push(`${year + 1}-${String(m).padStart(2, "0")}`);
  return keys;
}

function YearPillSwitcher({ years, selected, onSelect }) {
  return (
    <div
      className="flex items-center gap-1 rounded-xl bg-white p-[6px] shadow-[var(--shadow-card-lg)]"
      role="tablist"
      aria-label="Switch rotary year"
    >
      {years.map((year) => {
        const isActive = year === selected;
        return (
          <button
            key={year}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(year)}
            className={
              isActive
                ? "rounded-[9px] bg-[var(--color-brand-blue)] px-4 py-2 text-[13px] font-semibold text-white"
                : "rounded-[9px] bg-transparent px-4 py-2 text-[13px] font-semibold text-[#3c4655]"
            }
          >
            {rotaryYearLabel(year)}
          </button>
        );
      })}
    </div>
  );
}

function StatCard({ bg, color, value, label }) {
  return (
    <div
      className="rounded-2xl p-[18px_20px] shadow-[var(--shadow-card-lg)]"
      style={{ background: bg }}
    >
      <span className="block text-[28px] font-bold" style={{ color }}>
        {value}
      </span>
      <span className="text-[13px] text-[#0c2340]">{label}</span>
    </div>
  );
}

export default function DinnerEvents() {
  const { canRead, canWrite } = useAccess("attendance.forecast");
  const navigate = useNavigate();

  const [year, setYear] = useState(currentRotaryYear());
  const [yearOptions, setYearOptions] = useState(() =>
    Array.from(new Set([currentRotaryYear(), currentRotaryYear() + 1, currentRotaryYear() - 1])).sort(
      (a, b) => b - a,
    ),
  );
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState(null);
  const [members, setMembers] = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [startingEventId, setStartingEventId] = useState(null);
  const [rowError, setRowError] = useState(null);

  const [reportFormat, setReportFormat] = useState("pdf");
  // Story 16.17: multi-select — empty array means "all types".
  const [reportEventTypes, setReportEventTypes] = useState([]);
  // Story 16.17: defaults unchecked (all events — past ones show their
  // participation rate); checked narrows to forecast (future events only,
  // no attendance data yet).
  const [reportForecast, setReportForecast] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState(null);

  async function loadData() {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [eventsData, statsData] = await Promise.all([
        listDinnerForecastEvents({ rotary_year: year }),
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
      setLoadError(err.detail || "Failed to load dinner events");
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
    listDinnerEventTypes()
      .then(setEventTypes)
      .catch(() => setEventTypes([]));
  }, [canRead]);

  const eventsByMonth = useMemo(() => groupEventsByMonth(events), [events]);

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

  async function handleRowAction(event) {
    if (event.attendance_started) {
      navigate(`/dinners/${event.id}`);
      return;
    }
    setRowError(null);
    setStartingEventId(event.id);
    try {
      await startAttendanceForEvent(event.id);
      navigate(`/dinners/${event.id}`);
    } catch (err) {
      setRowError(err.detail || "Failed to start attendance for this event");
    } finally {
      setStartingEventId(null);
    }
  }

  // Story 16.25 — "Add to Calendar" at the individual event, month, and
  // global (all upcoming, across every month currently loaded) levels.
  function handleExportEvent(event) {
    downloadIcs(`rotary-${slugify(event.name)}-${event.event_date}.ics`, [event]);
  }

  function handleExportMonth(monthKey, monthEvents) {
    downloadIcs(`rotary-${slugify(monthLabel(monthKey))}-events.ics`, monthEvents);
  }

  function handleExportAllUpcoming() {
    const today = todayInHongKong();
    const upcoming = events.filter((event) => event.event_date >= today);
    downloadIcs("rotary-all-events.ics", upcoming);
  }

  function toggleReportEventType(name) {
    setReportEventTypes((current) =>
      current.includes(name) ? current.filter((t) => t !== name) : [...current, name],
    );
  }

  async function handleGenerateReport() {
    setIsGeneratingReport(true);
    setReportError(null);
    try {
      const { blob, filename } = await downloadDinnerForecastReport({
        rotary_year: year,
        format: reportFormat,
        event_type: reportEventTypes,
        forecast: reportForecast,
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
      <div className="admin-page admin-page-wide">
        <h1>Dinner / Events</h1>
        <p role="alert">You do not have permission to view Dinner / Events.</p>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page-wide">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="m-0 text-2xl font-semibold text-[#0c2340]">Dinner / Events</h1>
        <div className="flex items-center gap-3">
          {/* Story 16.25 — global-level export: every upcoming event across
              all months currently loaded (this rotary year), in one .ics. */}
          <button
            type="button"
            onClick={handleExportAllUpcoming}
            className="rounded-[10px] border border-[var(--color-brand-blue)] bg-white px-[14px] py-[9px] text-[13px] font-semibold text-[var(--color-brand-blue)]"
          >
            📅 Add all upcoming to calendar
          </button>
          {canWrite && (
            <button
              type="button"
              onClick={openCreate}
              className="rounded-[10px] bg-[var(--color-brand-blue)] px-[18px] py-[9px] text-[13px] font-semibold text-white"
            >
              New Dinner Event
            </button>
          )}
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <YearPillSwitcher years={yearOptions} selected={year} onSelect={setYear} />

        <div className="flex items-center gap-3">
          {/* Story 16.17: multi-select pill toggles (was a single-select
              dropdown) — "All" clears the filter, each type toggles
              independently, several can be active at once. */}
          <div className="flex items-center gap-1.5" role="group" aria-label="Event filter">
            <button
              type="button"
              onClick={() => setReportEventTypes([])}
              disabled={isGeneratingReport}
              aria-pressed={reportEventTypes.length === 0}
              className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                reportEventTypes.length === 0
                  ? "border-[var(--color-brand-blue)] bg-[var(--color-brand-blue)] text-white"
                  : "border-[var(--color-border-medium)] bg-white text-[var(--color-muted-text)]"
              }`}
            >
              All
            </button>
            {eventTypes.map((type) => {
              const active = reportEventTypes.includes(type.name);
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => toggleReportEventType(type.name)}
                  disabled={isGeneratingReport}
                  aria-pressed={active}
                  className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    active
                      ? "border-[var(--color-brand-blue)] bg-[var(--color-brand-blue)] text-white"
                      : "border-[var(--color-border-medium)] bg-white text-[var(--color-muted-text)]"
                  }`}
                >
                  {type.name}
                </button>
              );
            })}
          </div>

          <label htmlFor="dinner-report-format" className="sr-only">
            Format
          </label>
          <select
            id="dinner-report-format"
            value={reportFormat}
            onChange={(event) => setReportFormat(event.target.value)}
            disabled={isGeneratingReport}
            className="rounded-[10px] border border-[var(--color-border-medium)] px-3 py-2 text-[13px]"
          >
            <option value="pdf">PDF</option>
            <option value="csv">CSV</option>
          </select>

          <label
            htmlFor="dinner-report-forecast"
            className="flex items-center gap-1.5 text-[13px] text-[var(--color-muted-text)] whitespace-nowrap"
            title="Checked: upcoming events only. Unchecked: all events, with a participation rate for past ones."
          >
            <input
              id="dinner-report-forecast"
              type="checkbox"
              checked={reportForecast}
              onChange={(event) => setReportForecast(event.target.checked)}
              disabled={isGeneratingReport}
            />
            Forecast
          </label>

          <button
            type="button"
            onClick={handleGenerateReport}
            disabled={isGeneratingReport}
            className="rounded-[10px] bg-[var(--color-brand-blue-light)] px-4 py-[9px] text-[13px] font-semibold text-[var(--color-brand-blue)]"
          >
            {isGeneratingReport ? "Generating…" : "Generate Report"}
          </button>
        </div>
      </div>
      {reportError && <p role="alert">{reportError}</p>}
      {rowError && <p role="alert">{rowError}</p>}

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && stats && (
        <div className="mb-[22px] grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard
            bg="var(--tone-blue-bg)"
            color="var(--color-brand-blue)"
            value={stats.total_events}
            label={`Total events — ${rotaryYearLabel(year)}`}
          />
          <StatCard
            bg="var(--tone-teal-bg)"
            color="var(--color-tone-teal-text)"
            value={stats.average_attendance ?? "—"}
            label={
              stats.eligible_member_count
                ? `Average attendance — out of ${stats.eligible_member_count} members`
                : "Average attendance"
            }
          />
          <StatCard
            bg="var(--tone-amber-bg)"
            color="var(--color-tone-amber-text)"
            value={
              stats.average_attendance_percentage === null
                ? "—"
                : `${stats.average_attendance_percentage}%`
            }
            label="Average attendance %"
          />
        </div>
      )}

      {!isLoading && !loadError && events.length === 0 && (
        <p className="member-empty-state">No dinner events planned for {rotaryYearLabel(year)} yet.</p>
      )}

      {!isLoading && !loadError && events.length > 0 && (
        <div className="flex flex-col gap-4">
          {rotaryYearMonthKeys(year).map((monthKey) => (
            <MonthCard
              key={monthKey}
              monthKey={monthKey}
              events={eventsByMonth.get(monthKey) || []}
              eventTypes={eventTypes}
              canWrite={canWrite}
              startingEventId={startingEventId}
              onRowAction={handleRowAction}
              onEdit={openEdit}
              onDelete={handleDelete}
              onExportMonth={handleExportMonth}
              onExportEvent={handleExportEvent}
              speakerLabel={(event) => event.speaker_name || ""}
            />
          ))}
        </div>
      )}

      {isFormOpen && (
        <DinnerForecastEventFormModal
          event={editingEvent}
          members={members}
          eventTypes={eventTypes}
          onClose={() => setIsFormOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
