import { apiFetch } from "./client";

export function getEventSetup(eventId) {
  return apiFetch(`/events/${eventId}/setup`);
}

export function saveEventSetup(eventId, payload) {
  return apiFetch(`/events/${eventId}/setup`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function listTableMapping(eventId) {
  return apiFetch(`/events/${eventId}/table-mapping`);
}

export function createTableMapping(eventId, payload) {
  return apiFetch(`/events/${eventId}/table-mapping`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateTableMapping(eventId, mappingId, payload) {
  return apiFetch(`/events/${eventId}/table-mapping/${mappingId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteTableMapping(eventId, mappingId) {
  return apiFetch(`/events/${eventId}/table-mapping/${mappingId}`, { method: "DELETE" });
}

export function listEventCostCategories() {
  return apiFetch("/event-cost-categories");
}

export function createEventCostCategory(payload) {
  return apiFetch("/event-cost-categories", { method: "POST", body: JSON.stringify(payload) });
}

export function updateEventCostCategory(categoryId, payload) {
  return apiFetch(`/event-cost-categories/${categoryId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteEventCostCategory(categoryId) {
  return apiFetch(`/event-cost-categories/${categoryId}`, { method: "DELETE" });
}

export function listEventSponsorCategories() {
  return apiFetch("/event-sponsor-categories");
}

export function createEventSponsorCategory(payload) {
  return apiFetch("/event-sponsor-categories", { method: "POST", body: JSON.stringify(payload) });
}

export function updateEventSponsorCategory(categoryId, payload) {
  return apiFetch(`/event-sponsor-categories/${categoryId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteEventSponsorCategory(categoryId) {
  return apiFetch(`/event-sponsor-categories/${categoryId}`, { method: "DELETE" });
}
