import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { listEvents } from "../api/events";
import { useAccess } from "../hooks/useAccess";
import { useSelectedEvent } from "../hooks/useSelectedEvent";
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

// Must match useSelectedEvent's internal STORAGE_KEY (hooks/useSelectedEvent.js)
// — the hook itself stays unchanged (its sessionStorage-selection contract is
// intentionally the same across every Event sub-page), but a deep link from
// the Events list ("Manage project →" → /events/manage?event=<id>) needs to
// seed that same storage before the hook's lazy useState initializer reads
// it, which only happens on this component's very first render.
const SELECTED_EVENT_STORAGE_KEY = "events.selectedEventId";

export default function EventManageProject() {
  const { canRead } = useAccess("event.list");

  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

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

  return (
    <div className="admin-page admin-page-wide">
      <h1>Manage Project</h1>

      {isLoading && <p>Loading…</p>}
      {loadError && <p role="alert">{loadError}</p>}

      {!isLoading && !loadError && (
        <>
          <EventSwitcher events={events} selectedEvent={selectedEvent} onSelect={setSelectedEventId} />

          {selectedEvent && (
            <div className="mt-4">
              {PanelComponent ? (
                <>
                  <PanelBreadcrumb event={selectedEvent} onBack={closePanel} />
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
