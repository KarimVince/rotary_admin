import { apiFetch } from "./client";

export function listEvents() {
  return apiFetch("/events");
}

export function createEvent(payload) {
  return apiFetch("/events", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateEvent(eventId, payload) {
  return apiFetch(`/events/${eventId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteEvent(eventId) {
  return apiFetch(`/events/${eventId}`, { method: "DELETE" });
}
