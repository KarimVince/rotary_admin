import { formatDate } from "../utils/formatters";

// Story 14.13: pill/segmented event switcher shown atop the Manage Project
// page, replacing EventSelector's <select> dropdown. Still built on
// useSelectedEvent — this component only renders the pills and reports the
// clicked event id back via onSelect.
export default function EventSwitcher({ events, selectedEvent, onSelect }) {
  if (events.length === 0) {
    return (
      <div className="event-selector-bar">
        <p>No events yet — create one on the Event List page first.</p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1 rounded-xl bg-white p-[6px] shadow-[var(--shadow-card)]"
      role="tablist"
      aria-label="Switch event"
    >
      {events.map((event) => {
        const isActive = event.id === selectedEvent?.id;
        return (
          <button
            key={event.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(event.id)}
            className={
              isActive
                ? "rounded-[9px] bg-[var(--color-brand-blue)] px-4 py-2 text-[13px] font-semibold text-white"
                : "rounded-[9px] bg-transparent px-4 py-2 text-[13px] font-semibold text-[#3c4655]"
            }
          >
            {event.name} — {formatDate(event.date)}
          </button>
        );
      })}
    </div>
  );
}
