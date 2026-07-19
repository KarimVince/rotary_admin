import { apiDownload, apiFetch } from "./client";

export function listEventSponsors(eventId) {
  return apiFetch(`/events/${eventId}/sponsors`);
}

export function createEventSponsor(eventId, payload) {
  return apiFetch(`/events/${eventId}/sponsors`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateEventSponsor(eventId, sponsorId, payload) {
  return apiFetch(`/events/${eventId}/sponsors/${sponsorId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteEventSponsor(eventId, sponsorId) {
  return apiFetch(`/events/${eventId}/sponsors/${sponsorId}`, { method: "DELETE" });
}

export function downloadEventSponsorReport(eventId, format) {
  return apiDownload(`/events/${eventId}/sponsors/report?format=${format}`);
}
