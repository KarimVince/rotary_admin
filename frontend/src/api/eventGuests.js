import { apiDownload, apiFetch } from "./client";

export function listEventGuests(eventId) {
  return apiFetch(`/events/${eventId}/guests`);
}

export function createEventGuest(eventId, payload) {
  return apiFetch(`/events/${eventId}/guests`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateEventGuest(eventId, guestId, payload) {
  return apiFetch(`/events/${eventId}/guests/${guestId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteEventGuest(eventId, guestId) {
  return apiFetch(`/events/${eventId}/guests/${guestId}`, { method: "DELETE" });
}

export function downloadEventGuestListReport(eventId, format) {
  return apiDownload(`/events/${eventId}/guests/report?format=${format}`);
}
