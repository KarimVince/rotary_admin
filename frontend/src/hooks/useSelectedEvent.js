import { useEffect, useState } from "react";

// Story 14.2: the selected event persists for the user's session (not
// across browser restarts), so sessionStorage — not localStorage — backs
// this hook. Every Event module sub-page calls this with the same list of
// events so the selection stays in sync across pages.
const STORAGE_KEY = "events.selectedEventId";

export function useSelectedEvent(events) {
  const [selectedEventId, setSelectedEventId] = useState(() =>
    sessionStorage.getItem(STORAGE_KEY),
  );

  useEffect(() => {
    if (events.length === 0) return;

    const stillExists = events.some((event) => event.id === selectedEventId);
    if (stillExists) return;

    // Defaults to the most recently created event (Story 14.2) — events
    // are already sorted rotary_year desc, date desc from the API, but
    // "most recently created" is created_at, not date, so pick explicitly.
    const mostRecentlyCreated = events.reduce((latest, event) =>
      new Date(event.created_at) > new Date(latest.created_at) ? event : latest,
    );
    setSelectedEventId(mostRecentlyCreated.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  useEffect(() => {
    if (selectedEventId) {
      sessionStorage.setItem(STORAGE_KEY, selectedEventId);
    }
  }, [selectedEventId]);

  const selectedEvent = events.find((event) => event.id === selectedEventId) || null;

  return { selectedEvent, selectedEventId, setSelectedEventId };
}
