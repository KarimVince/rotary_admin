import { apiDownload, apiFetch } from "./client";

export function listEventCosts(eventId) {
  return apiFetch(`/events/${eventId}/costs`);
}

export function createEventCost(eventId, payload) {
  return apiFetch(`/events/${eventId}/costs`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateEventCost(eventId, costId, payload) {
  return apiFetch(`/events/${eventId}/costs/${costId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteEventCost(eventId, costId) {
  return apiFetch(`/events/${eventId}/costs/${costId}`, { method: "DELETE" });
}

export function downloadEventCostReport(eventId, format) {
  return apiDownload(`/events/${eventId}/costs/report?format=${format}`);
}
