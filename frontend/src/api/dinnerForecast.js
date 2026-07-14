import { apiDownload, apiFetch } from "./client";

function buildQuery(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
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

export function downloadDinnerForecastReport(filters = {}) {
  return apiDownload(`/dinner-forecast/report${buildQuery(filters)}`);
}
