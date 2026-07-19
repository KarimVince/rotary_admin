import { apiDownload, apiFetch } from "./client";

export function getEventSummary(eventId) {
  return apiFetch(`/events/${eventId}/summary`);
}

export function downloadEventSummaryReport(eventId, format) {
  return apiDownload(`/events/${eventId}/summary/report?format=${format}`);
}
