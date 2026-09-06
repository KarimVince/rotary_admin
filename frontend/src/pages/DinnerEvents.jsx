import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Download, FileBarChart2, Filter } from "lucide-react";
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
import { useRotaryYears } from "../hooks/useRotaryYears";
import { rotaryYearLabel } from "../utils/rotaryYear";
import { todayInHongKong } from "../utils/eventDate";
import { downloadIcs, slugify } from "../utils/ics";
import Card from "../components/Card";
import DinnerForecastEventFormModal from "../components/DinnerForecastEventFormModal";
import MultiSelectDropdown from "../components/MultiSelectDropdown";
import SingleSelectDropdown from "../components/SingleSelectDropdown";
import MonthCard, { groupEventsByMonth, monthLabel } from "../components/DinnerMonthCard";

// Rotary year runs Jul -> Jun; returns the 12 "YYYY-MM" keys in that order
// so month cards render Jul first, Jun last, regardless of calendar order.
function rotaryYearMonthKeys(year) {
  const keys = [];
  for (let m = 7; m <= 12; m++) keys.push(`${year}-${String(m).padStart(2, "0")}`);
  for (let m = 1; m <= 6; m++) keys.push(`${year + 1}-${String(m).padStart(2, "0")}`);
  return keys;
}

// 2026-08-06: stat-card shape matches Dashboard's exactly (value-first
// <span>, label <span>, inside a `.stat-duo-grid` parent for the
// position-based blue/gold alternation + compact type-scale).
function StatCard({ value, label, tone }) {
  return (
    <Card variant={tone} className="flex flex-col">
      <span className="text-3xl font-bold">{value}</span>
      <span className="mt-2 text-sm">{label}</span>
    </Card>
  );
}

export default function DinnerEvents() {
  const { canRead, canWrite } = useAccess("attendance.forecast");
  const navigate = useNavigate();

  const { yearOptions, selectedYear: year, setSelectedYear: setYear } = useRotaryYears();
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

  const SESSION_KEY_FORMAT = "dinnerEvents.report.format";
  const SESSION_KEY_USE_TEMPLATE = "dinnerEvents.report.useTemplate";

  const [reportFormat, setReportFormat] = useState(
    () => sessionStorage.getItem(SESSION_KEY_FORMAT) || "pdf",
  );
  // Story 16.17: multi-select — empty array means "all types".
  const [reportEventTypes, setReportEventTypes] = useState([]);
  // Story 16.17: defaults unchecked (all events — past ones show their
  // participation rate); checked narrows to forecast (future events only,
  // no attendance data yet).
  const [reportForecast, setReportForecast] = useState(false);
  // PPTX only: use the district template chrome (dark band asset).
  const [useTemplate, setUseTemplate] = useState(
    () => sessionStorage.getItem(SESSION_KEY_USE_TEMPLATE) === "true",
  );
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState(null);

  function handleFormatChange(value) {
    setReportFormat(value);
    sessionStorage.setItem(SESSION_KEY_FORMAT, value);
  }

  function handleUseTemplateChange(checked) {
    setUseTemplate(checked);
    sessionStorage.setItem(SESSION_KEY_USE_TEMPLATE, String(checked));
  }

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
        useTemplate: reportFormat === "pptx" ? useTemplate : undefined,
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
        <h1 className="m-0 text-2xl font-semibold text-[var(--text-h)]">Dinner / Events</h1>
        <div className="flex items-center gap-3">
          {/* Story 16.25 — global-level export: every upcoming event across
              all months currently loaded (this rotary year), in one .ics. */}
          <button
            type="button"
            onClick={handleExportAllUpcoming}
            className="rounded-[10px] border border-[var(--color-brand-blue)] bg-white px-[14px] py-[9px] text-[13px] font-semibold text-[var(--color-brand-blue)]"
          >
            📅 Add all to calendar
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

      <div className="mb-4">
        <SingleSelectDropdown
          icon={CalendarDays}
          ariaLabel="Switch rotary year"
          minWidthClass="min-w-[150px]"
          value={year}
          options={yearOptions.map((y) => ({ value: y, label: rotaryYearLabel(y) }))}
          onSelect={setYear}
        />
      </div>

      <section className="mb-6 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-[16px_18px]">
        <div className="mb-3.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.12em] text-[var(--faint)]">
          <FileBarChart2 className="w-[15px] h-[15px] text-[var(--accent)]" aria-hidden="true" />
          <span>Generate attendance report</span>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="pl-0.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]">
              Event type
            </span>
            <MultiSelectDropdown
              icon={Filter}
              ariaLabel="Event type filter"
              allLabel="All types"
              disabled={isGeneratingReport}
              options={eventTypes.map((type) => ({ value: type.name, label: type.name }))}
              selected={reportEventTypes}
              onToggleOption={toggleReportEventType}
              onClear={() => setReportEventTypes([])}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="pl-0.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]">
              Format
            </span>
            <SingleSelectDropdown
              ariaLabel="Format"
              minWidthClass="min-w-[110px]"
              disabled={isGeneratingReport}
              value={reportFormat}
              options={[
                { value: "pdf", label: "PDF" },
                { value: "pptx", label: "PowerPoint" },
                { value: "csv", label: "CSV" },
              ]}
              onSelect={handleFormatChange}
            />
          </div>

          {reportFormat === "pptx" && (
            <div className="flex flex-col gap-1.5">
              <span className="pl-0.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]">
                Chrome
              </span>
              <label
                htmlFor="dinner-report-use-template"
                className="flex h-[38px] items-center gap-2 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]"
              >
                <input
                  id="dinner-report-use-template"
                  type="checkbox"
                  checked={useTemplate}
                  onChange={(e) => handleUseTemplateChange(e.target.checked)}
                  disabled={isGeneratingReport}
                />
                Use district template
              </label>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="pl-0.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]">
              Scope
            </span>
            <label
              htmlFor="dinner-report-forecast"
              className="flex h-[38px] items-center gap-2 text-[13px] text-[var(--ink-2)]"
              title="Checked: upcoming events only. Unchecked: all events, with a participation rate for past ones."
            >
              <input
                id="dinner-report-forecast"
                type="checkbox"
                checked={reportForecast}
                onChange={(event) => setReportForecast(event.target.checked)}
                disabled={isGeneratingReport}
              />
              Forecast only (upcoming)
            </label>
          </div>

          <div className="ml-auto flex flex-col gap-1.5">
            <span className="pl-0.5 text-[11px]">&nbsp;</span>
            <button
              type="button"
              onClick={handleGenerateReport}
              disabled={isGeneratingReport}
              className="inline-flex h-[38px] items-center gap-2 rounded-[8px] bg-[var(--accent)] px-4 text-[13px] font-semibold text-white hover:bg-[var(--accent-ink)] disabled:opacity-50"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              {isGeneratingReport ? "Generating…" : "Generate Report"}
            </button>
          </div>
        </div>
      </section>
      {reportError && (
        <p role="alert" className="mb-3 text-[13px] text-[var(--low)]">
          {reportError}
        </p>
      )}
      {rowError && <p role="alert">{rowError}</p>}

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && stats && (
        <div className="mb-[22px] grid grid-cols-1 gap-4 md:grid-cols-3 stat-duo-grid">
          <StatCard
            tone="stat-blue"
            value={stats.total_events}
            label={`Total events — ${rotaryYearLabel(year)}`}
          />
          <StatCard
            tone="stat-teal"
            value={stats.average_attendance ?? "—"}
            label={
              stats.eligible_member_count
                ? `Average attendance — out of ${stats.eligible_member_count} members`
                : "Average attendance"
            }
          />
          <StatCard
            tone="stat-amber"
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
