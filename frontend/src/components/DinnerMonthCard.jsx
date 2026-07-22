import { ATTENDANCE_GREEN_MIN } from "../utils/attendanceThresholds";
import { formatTime12h, isFutureEventDate } from "../utils/eventDate";
import Card from "./Card";

// Story 16.10: event types are admin-configurable now (Admin > Dinner Event
// Types) — a type without configured colors falls back to this neutral
// grey chip rather than a broken/blank one.
const DEFAULT_TYPE_CHIP_CLASS = "bg-[#f0f2f6] text-[#6b7686]";

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabel(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export function groupEventsByMonth(events) {
  const groups = new Map();
  events.forEach((event) => {
    const key = event.event_date.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  });
  groups.forEach((monthEvents) => monthEvents.sort((a, b) => a.event_date.localeCompare(b.event_date)));
  return groups;
}

// Story 16.18: average attendance count + participation rate for the month
// title row, computed only from events whose attendance sheet has actually
// been taken (attendance_started, and the date has passed — a future-dated
// event with started=true still reads as "Not started" per Story 16.9's
// AttendanceChip rule, so it's excluded here too for consistency).
export function monthAttendanceSummary(events) {
  const completed = events.filter(
    (event) => event.attendance_started && !isFutureEventDate(event.event_date),
  );
  if (completed.length === 0) return null;
  const totalPresent = completed.reduce((sum, event) => sum + event.present_count, 0);
  const totalEligible = completed.reduce((sum, event) => sum + event.eligible_total, 0);
  return {
    avgCount: Math.round(totalPresent / completed.length),
    avgPct: totalEligible ? Math.round((totalPresent / totalEligible) * 100) : 0,
  };
}

export function TypeChip({ eventType, eventTypes }) {
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

// Story 16.10/16.18/16.21: the single shared "month of dinner/events" card
// used by the Dinner/Events page and the Dashboard's Club Planning section
// (16.21 reuses this exact component per its "same card layout and style as
// in the existing report" acceptance criterion). `canWrite`/`onEdit`/
// `onDelete` are optional — omit them (Dashboard's read-only use) to render
// the row without the Edit/Delete actions.
export default function MonthCard({
  monthKey,
  events,
  eventTypes,
  canWrite = false,
  startingEventId,
  onRowAction,
  onEdit,
  onDelete,
  onExportMonth,
  onExportEvent,
  speakerLabel,
}) {
  const attendanceSummary = monthAttendanceSummary(events);
  return (
    <Card variant="default" className="flex flex-col gap-1 p-[18px_20px]">
      <div className="mb-1 flex items-baseline justify-between border-b border-[#eef1f5] pb-3">
        <span className="text-[17px] font-bold text-[var(--color-brand-blue)]">
          {monthLabel(monthKey)}
        </span>
        <span className="flex items-baseline gap-4">
          {attendanceSummary && (
            <span className="w-fit rounded-full bg-[var(--tone-rose-bg)] px-[10px] py-1 text-[12px] font-bold text-[var(--color-tone-rose-text)]">
              {`Monthly Average Participation: ${attendanceSummary.avgCount} Members · ${attendanceSummary.avgPct}%`}
            </span>
          )}
          <span className="text-[12px] font-semibold text-[var(--color-muted-text)]">
            {events.length} {events.length === 1 ? "event" : "events"}
          </span>
          {/* Story 16.25 — month-level batch .ics export. */}
          {onExportMonth && events.length > 0 && (
            <button
              type="button"
              onClick={() => onExportMonth(monthKey, events)}
              className="bg-transparent p-0 text-[12px] font-semibold text-[var(--color-brand-blue)]"
            >
              📅 Add month to calendar
            </button>
          )}
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
            <div className="flex flex-col gap-[2px]">
              <span className="text-[14px] font-bold text-[#0c2340]">
                {Number(event.event_date.slice(8, 10))} {MONTH_NAMES[monthKey.split("-")[1] - 1].slice(0, 3)}
              </span>
              {event.start_time && (
                <span className="text-[11px] font-semibold text-[var(--color-muted-text)]">
                  {formatTime12h(event.start_time)}
                </span>
              )}
            </div>
            <TypeChip eventType={event.event_type} eventTypes={eventTypes} />
            <div className="flex flex-col gap-[2px]">
              <span className="text-[14px] font-semibold text-[#0c2340]">{event.name}</span>
              {event.location && (
                <span className="text-[12px] text-[var(--color-muted-text)]">{event.location}</span>
              )}
            </div>
            <span className="flex flex-col gap-[2px] text-[13px] text-[var(--color-muted-text)]">
              {speakerLabel(event) ? (
                <span>
                  <span className="text-[#9aa7ba]">Speaker:</span> {speakerLabel(event)}
                </span>
              ) : (
                "—"
              )}
              {event.ngo_organisation_name && (
                <span className="text-[12px]">
                  <span className="text-[#9aa7ba]">NGO:</span> {event.ngo_organisation_name}
                </span>
              )}
            </span>
            {event.member_only ? <MemberOnlyChip /> : <span />}
            <div className="flex justify-end">
              <AttendanceChip event={event} />
            </div>
            <div className="flex items-center justify-end gap-3 whitespace-nowrap">
              {onRowAction && (
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
              )}
              {onExportEvent && (
                <button
                  type="button"
                  onClick={() => onExportEvent(event)}
                  title="Add to calendar"
                  aria-label={`Add ${event.name} to calendar`}
                  className="bg-transparent p-0 text-[13px] font-semibold text-[var(--color-brand-blue)]"
                >
                  📅
                </button>
              )}
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

// Story 16.21: Dashboard's Club Planning strip — mirrors the PDF report's
// month-card format (backend/app/core/dinner_forecast_report.py's
// `_month_card`: date + type chip on their own line, then location, then
// speaker) rather than the Dinner/Events page's full row (no name, no
// attendance chip, no NGO/member-only chip, no actions) — a compact
// glance, not the full management view.
export function CompactMonthCard({ monthKey, events, eventTypes }) {
  return (
    <Card variant="default" className="flex flex-col gap-1 p-4">
      <div className="mb-1 border-b border-[#eef1f5] pb-2">
        <span className="text-[15px] font-bold text-[var(--color-brand-blue)]">
          {monthLabel(monthKey)}
        </span>
      </div>
      {events.length === 0 ? (
        <p className="py-2 text-[13px] text-[var(--color-muted-text)]">No events this month</p>
      ) : (
        events.map((event) => (
          <div
            key={event.id}
            className="flex flex-col gap-1 border-b border-[var(--color-border-faint)] py-2 last:border-b-0"
          >
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-[#0c2340]">
                {Number(event.event_date.slice(8, 10))} {MONTH_NAMES[monthKey.split("-")[1] - 1].slice(0, 3)}
                {event.start_time && `, ${formatTime12h(event.start_time)}`}
              </span>
              <TypeChip eventType={event.event_type} eventTypes={eventTypes} />
              <span className="text-[12px] text-[var(--color-muted-text)]">
                {event.location || "—"}
              </span>
            </div>
            {event.speaker_name && (
              <span className="text-[12px] text-[var(--color-muted-text)]">
                <span className="text-[#9aa7ba]">Speaker:</span> {event.speaker_name}
              </span>
            )}
          </div>
        ))
      )}
    </Card>
  );
}
