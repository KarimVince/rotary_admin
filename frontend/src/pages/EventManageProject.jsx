import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { listEvents } from "../api/events";
import { useAccess } from "../hooks/useAccess";
import { useSelectedEvent } from "../hooks/useSelectedEvent";
import { useRotaryYears } from "../hooks/useRotaryYears";
import { useTheme } from "../context/ThemeContext";
import { formatDate } from "../utils/formatters";
import RotaryYearField from "../components/RotaryYearField";
import SingleSelectDropdown from "../components/SingleSelectDropdown";
import EventSwitcher from "../components/EventSwitcher";
import EventManageBento from "../components/EventManageBento";
import PanelBreadcrumb from "../components/PanelBreadcrumb";
import EventSetup from "./EventSetup";
import EventGuestList from "./EventGuestList";
import EventLuckyDraw from "./EventLuckyDraw";
import EventOperationalCost from "./EventOperationalCost";
import EventSponsors from "./EventSponsors";
import EventSummary from "./EventSummary";
import EventRundown from "./EventRundown";

const PANEL_COMPONENTS = {
  setup: EventSetup,
  guests: EventGuestList,
  sponsors: EventSponsors,
  costs: EventOperationalCost,
  lucky: EventLuckyDraw,
  rundown: EventRundown,
  summary: EventSummary,
};

const PANEL_LABELS = {
  setup: "Setup",
  guests: "Guest List",
  sponsors: "Sponsors",
  costs: "Operational Cost",
  lucky: "Lucky Draw",
  rundown: "Rundown",
  summary: "Summary",
};

// Must match useSelectedEvent's internal STORAGE_KEY (hooks/useSelectedEvent.js)
// — the hook itself stays unchanged (its sessionStorage-selection contract is
// intentionally the same across every Event sub-page), but a deep link from
// the Events list ("Manage project →" → /events/manage?event=<id>) needs to
// seed that same storage before the hook's lazy useState initializer reads
// it, which only happens on this component's very first render.
const SELECTED_EVENT_STORAGE_KEY = "events.selectedEventId";

export default function EventManageProject() {
  const { isMinimal } = useTheme();
  const { canRead } = useAccess("event.list");

  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const { yearOptions, currentYear, selectedYear, setSelectedYear } = useRotaryYears({
    persistKey: "events",
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const panel = searchParams.get("panel");

  // Written synchronously during render (before useSelectedEvent below reads
  // sessionStorage in its lazy initializer) rather than in an effect —
  // effects here would race useSelectedEvent's own default-selection effect,
  // since both depend on `events` and neither sees the other's state update
  // within the same flush. Doing it during render sidesteps the race
  // entirely. Validity against the real events list still gets checked by
  // useSelectedEvent's own effect once events load (falls back to its usual
  // default if the id turns out not to exist).
  const eventIdFromUrl = searchParams.get("event");
  if (eventIdFromUrl) {
    sessionStorage.setItem(SELECTED_EVENT_STORAGE_KEY, eventIdFromUrl);
  }

  const { selectedEvent, setSelectedEventId } = useSelectedEvent(events);

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }
    listEvents()
      .then(setEvents)
      .catch((err) => setLoadError(err.detail || "Failed to load events"))
      .finally(() => setIsLoading(false));
  }, [canRead]);

  // Keep the Rotary Year filter in sync with whichever event ends up
  // selected (default pick, a deep link's ?event=, or a pill/dropdown
  // click) so the Project dropdown never hides the event it's showing.
  useEffect(() => {
    if (!selectedEvent) return;
    if (selectedEvent.rotary_year !== selectedYear) {
      setSelectedYear(selectedEvent.rotary_year);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvent?.id]);

  // The reverse direction: picking a different Rotary Year from the
  // dropdown leaves `selectedEvent` pointing at a project from the old
  // year, which doesn't match any option in that year's Project dropdown —
  // SingleSelectDropdown then has no matching option to label itself with
  // and falls back to rendering the raw (uuid) value. Auto-pick a real
  // project for the newly chosen year whenever the current selection no
  // longer belongs to it (mirrors useSelectedEvent's own "most recently
  // created" default). A no-op once the two are already in sync, so this
  // can't fight the effect above.
  useEffect(() => {
    if (selectedEvent && selectedEvent.rotary_year === selectedYear) return;
    const candidates = events.filter((event) => event.rotary_year === selectedYear);
    if (candidates.length === 0) return;
    const mostRecentlyCreated = candidates.reduce((latest, event) =>
      new Date(event.created_at) > new Date(latest.created_at) ? event : latest,
    );
    setSelectedEventId(mostRecentlyCreated.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, events]);

  // Strip ?event= once consumed so a later pill click (which only touches
  // sessionStorage) can't be fought by a stale URL param on browser
  // back/forward.
  useEffect(() => {
    if (!searchParams.get("event")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("event");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openPanel(key) {
    setSearchParams({ panel: key });
  }

  function closePanel() {
    const next = new URLSearchParams(searchParams);
    next.delete("panel");
    setSearchParams(next);
  }

  if (!canRead) {
    return (
      <div className="admin-page admin-page-wide">
        <h1>Manage Project</h1>
        <p role="alert">You do not have permission to view Manage Project.</p>
      </div>
    );
  }

  const PanelComponent = panel ? PANEL_COMPONENTS[panel] : null;

  const eventsForYear = events.filter((event) => event.rotary_year === selectedYear);

  return (
    <div className="admin-page admin-page-wide">
      <h1>Manage Project</h1>
      {isMinimal && selectedEvent && (
        <p className="-mt-2 mb-4 text-[13.5px] text-[var(--muted)]">
          {selectedEvent.name} · {formatDate(selectedEvent.date)} · {selectedEvent.venue}
        </p>
      )}

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && (
        <>
          {isMinimal ? (
            !PanelComponent && (
              <div className="flex flex-wrap items-end gap-3">
                <RotaryYearField
                  year={selectedYear}
                  yearOptions={yearOptions}
                  currentYear={currentYear}
                  onChange={setSelectedYear}
                  className="mb-0"
                />
                <div className="mb-4 flex flex-col gap-1.5">
                  <span className="pl-0.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--faint)]">
                    Project
                  </span>
                  {eventsForYear.length === 0 ? (
                    <p className="flex h-[38px] items-center text-[13.5px] text-[var(--muted)]">
                      No events for this rotary year.
                    </p>
                  ) : (
                    <SingleSelectDropdown
                      ariaLabel="Project"
                      minWidthClass="min-w-[220px]"
                      value={selectedEvent?.id ?? ""}
                      options={eventsForYear.map((event) => ({
                        value: event.id,
                        label: `${event.name} — ${formatDate(event.date)}`,
                      }))}
                      onSelect={setSelectedEventId}
                    />
                  )}
                </div>
              </div>
            )
          ) : (
            <EventSwitcher events={events} selectedEvent={selectedEvent} onSelect={setSelectedEventId} />
          )}

          {selectedEvent && (
            <div className="mt-4">
              {PanelComponent ? (
                <>
                  <PanelBreadcrumb event={selectedEvent} panelLabel={PANEL_LABELS[panel]} onBack={closePanel} />
                  <PanelComponent event={selectedEvent} />
                </>
              ) : (
                <EventManageBento eventId={selectedEvent.id} onOpenPanel={openPanel} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
