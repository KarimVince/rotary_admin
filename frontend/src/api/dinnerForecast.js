import { apiDownload, apiFetch } from "./client";

function buildQuery(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    // Story 16.17: the event-type filter is multi-select — an array value
    // becomes one repeated query param per entry (`event_type=Dinner&
    // event_type=Fellowship`), matching FastAPI's `list[str]` query parsing.
    if (Array.isArray(value)) {
      value.forEach((entry) => query.append(key, entry));
    } else {
      query.set(key, value);
    }
  });
  const queryString = query.toString();
  return queryString ? `?${queryString}` : "";
}

export function listDinnerForecastEvents(filters = {}) {
  return apiFetch(`/dinner-forecast/events${buildQuery(filters)}`);
}

export function createDinnerForecastEvent(payload) {
  return apiFetch("/dinner-forecast/events", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateDinnerForecastEvent(eventId, payload) {
  return apiFetch(`/dinner-forecast/events/${eventId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteDinnerForecastEvent(eventId) {
  return apiFetch(`/dinner-forecast/events/${eventId}`, { method: "DELETE" });
}

export function downloadDinnerForecastReport({ forecast, ...filters } = {}) {
  return apiDownload(
    `/dinner-forecast/report${buildQuery({ ...filters, forecast: forecast ? "true" : undefined })}`,
  );
}
