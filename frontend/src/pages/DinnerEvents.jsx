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
import { ATTENDANCE_GREEN_MIN } from "../utils/attendanceThresholds";
import { isFutureEventDate } from "../utils/eventDate";
import DinnerForecastEventFormModal from "../components/DinnerForecastEventFormModal";
import Card from "../components/Card";

// Story 16.10: event types are admin-configurable now (Admin > Dinner Event
// Types) — a type without configured colors falls back to this neutral
// grey chip rather than a broken/blank one.
const DEFAULT_TYPE_CHIP_CLASS = "bg-[#f0f2f6] text-[#6b7686]";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Rotary year runs Jul -> Jun; returns the 12 "YYYY-MM" keys in that order
// so month cards render Jul first, Jun last, regardless of calendar order.
function rotaryYearMonthKeys(year) {
  const keys = [];
  for (let m = 7; m <= 12; m++) keys.push(`${year}-${String(m).padStart(2, "0")}`);
  for (let m = 1; m <= 6; m++) keys.push(`${year + 1}-${String(m).padStart(2, "0")}`);
  return keys;
}

function monthLabel(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function groupEventsByMonth(events) {
  const groups = new Map();
  events.forEach((event) => {
    const key = event.event_date.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  });
  groups.forEach((monthEvents) => monthEvents.sort((a, b) => a.event_date.localeCompare(b.event_date)));
  return groups;
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

function TypeChip({ eventType, eventTypes }) {
  const type = eventTypes.find((t) => t.name === eventType);
  const style =
    type?.color_bg && type?.color_text
      ? { background: type.color_bg, color: type.color_text }
      : undefined;
  return (
    <span
      className={`w-fit rounded-full px-[10px] py-[3px] text-[11px] font-bold ${style ? "" : DEFAULT_TYPE_CHIP_CLASS}`}
      style={style}
    >
      {eventType}
    </span>
  );
}

function MemberOnlyChip() {
  return (
    <span className="w-fit whitespace-nowrap rounded-full bg-[var(--tone-amber-bg)] px-[8px] py-[2px] text-[10px] font-bold text-[var(--color-tone-amber-text)]">
      Members Only
    </span>
  );
}

function AttendanceChip({ event }) {
  // Story 16.9: a future-dated event always reads as "Not started" even if
  // someone already opened its sheet and saved marks — the event hasn't
  // happened yet, so a live count would be misleading. The data itself is
  // untouched, just not surfaced here until the event's date has passed.
  if (!event.attendance_started || isFutureEventDate(event.event_date)) {
    return (
      <span className="w-fit rounded-full bg-[#f0f2f6] px-[10px] py-1 text-[12px] font-bold text-[#6b7686]">
        Not started
      </span>
    );
  }
  const healthy = event.attendance_percentage >= ATTENDANCE_GREEN_MIN;
  return (
    <span
      className={
        healthy
          ? "w-fit rounded-full bg-[var(--tone-teal-bg)] px-[10px] py-1 text-[12px] font-bold text-[var(--color-tone-teal-text)]"
          : "w-fit rounded-full bg-[var(--tone-rose-bg)] px-[10px] py-1 text-[12px] font-bold text-[var(--color-tone-rose-text)]"
      }
    >
      {event.present_count}/{event.eligible_total} · {event.attendance_percentage}%
    </span>
  );
}

const MONTH_ROW_GRID_COLS = "90px 100px 1.5fr 1fr 100px 150px 250px";

function MonthCard({
  monthKey,
  events,
  eventTypes,
  canWrite,
  startingEventId,
  onRowAction,
  onEdit,
  onDelete,
  speakerLabel,
}) {
  return (
    <Card variant="default" className="flex flex-col gap-1 p-[18px_20px]">
      <div className="mb-1 flex items-baseline justify-between border-b border-[#eef1f5] pb-3">
        <span className="text-[17px] font-bold text-[var(--color-brand-blue)]">
          {monthLabel(monthKey)}
        </span>
        <span className="text-[12px] font-semibold text-[var(--color-muted-text)]">
          {events.length} {events.length === 1 ? "event" : "events"}
        </span>
      </div>
      {events.length === 0 ? (
        <p className="py-2 text-[13px] text-[var(--color-muted-text)]">No events this month</p>
      ) : (
        events.map((event) => (
          <div
            key={event.id}
            className="grid items-center gap-4 border-b border-[var(--color-border-faint)] py-3 last:border-b-0"
            style={{ gridTemplateColumns: MONTH_ROW_GRID_COLS }}
          >
            <span className="text-[14px] font-bold text-[#0c2340]">
              {Number(event.event_date.slice(8, 10))} {MONTH_NAMES[monthKey.split("-")[1] - 1].slice(0, 3)}
            </span>
            <TypeChip eventType={event.event_type} eventTypes={eventTypes} />
            <div className="flex flex-col gap-[2px]">
              <span className="text-[14px] font-semibold text-[#0c2340]">{event.name}</span>
              {event.location && (
                <span className="text-[12px] text-[var(--color-muted-text)]">{event.location}</span>
              )}
            </div>
            <span className="text-[13px] text-[var(--color-muted-text)]">
              {speakerLabel(event) ? (
                <>
                  <span className="text-[#9aa7ba]">Speaker:</span> {speakerLabel(event)}
                </>
              ) : (
                "—"
              )}
            </span>
            {event.member_only ? <MemberOnlyChip /> : <span />}
            <div className="flex justify-end">
              <AttendanceChip event={event} />
            </div>
            <div className="flex items-center justify-end gap-3 whitespace-nowrap">
              <button
                type="button"
                onClick={() => onRowAction(event)}
                disabled={startingEventId === event.id}
                className="bg-transparent p-0 text-[13px] font-semibold text-[var(--color-brand-blue)]"
              >
                {startingEventId === event.id
                  ? "Starting…"
                  : event.attendance_started && !isFutureEventDate(event.event_date)
                    ? "View sheet →"
                    : "Take attendance →"}
              </button>
              {canWrite && (
                <>
                  <button
                    type="button"
                    onClick={() => onEdit(event)}
                    className="bg-transparent p-0 text-[13px] font-semibold text-[var(--color-brand-blue)]"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(event)}
                    className="bg-transparent p-0 text-[13px] font-semibold text-[var(--color-tone-rose-text)]"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        ))
      )}
    </Card>
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
  const [reportEventType, setReportEventType] = useState("all");
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
      <div className="admin-page admin-page-wide">
        <h1>Dinner Events</h1>
        <p role="alert">You do not have permission to view Dinner Events.</p>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page-wide">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="m-0 text-2xl font-semibold text-[#0c2340]">Dinner Events</h1>
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

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <YearPillSwitcher years={yearOptions} selected={year} onSelect={setYear} />

        <div className="flex items-center gap-3">
          <label htmlFor="dinner-report-type" className="sr-only">
            Event filter
          </label>
          <select
            id="dinner-report-type"
            value={reportEventType}
            onChange={(event) => setReportEventType(event.target.value)}
            disabled={isGeneratingReport}
            className="rounded-[10px] border border-[var(--color-border-medium)] px-3 py-2 text-[13px]"
          >
            <option value="all">All events</option>
            {eventTypes.map((type) => (
              <option key={type.id} value={type.name}>
                {type.name} only
              </option>
            ))}
          </select>

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
