import { apiDownload, apiFetch } from "./client";

export function listEventRundown(eventId) {
  return apiFetch(`/events/${eventId}/rundown`);
}

export function createEventRundownRow(eventId, payload) {
  return apiFetch(`/events/${eventId}/rundown`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateEventRundownRow(eventId, rowId, payload) {
  return apiFetch(`/events/${eventId}/rundown/${rowId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteEventRundownRow(eventId, rowId) {
  return apiFetch(`/events/${eventId}/rundown/${rowId}`, { method: "DELETE" });
}

export function reorderEventRundown(eventId, items) {
  return apiFetch(`/events/${eventId}/rundown/reorder`, {
    method: "PATCH",
    body: JSON.stringify({ items }),
  });
}

export function downloadEventRundownReport(eventId, format) {
  return apiDownload(`/events/${eventId}/rundown/report?format=${format}`);
}
