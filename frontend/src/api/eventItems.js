import { apiDownload, apiFetch } from "./client";

export function listEventItems(eventId) {
  return apiFetch(`/events/${eventId}/items`);
}

export function createEventItem(eventId, payload) {
  return apiFetch(`/events/${eventId}/items`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateEventItem(eventId, itemId, payload) {
  return apiFetch(`/events/${eventId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteEventItem(eventId, itemId) {
  return apiFetch(`/events/${eventId}/items/${itemId}`, { method: "DELETE" });
}

export function getLuckyDrawConfig(eventId) {
  return apiFetch(`/events/${eventId}/lucky-draw-config`);
}

export function saveLuckyDrawConfig(eventId, payload) {
  return apiFetch(`/events/${eventId}/lucky-draw-config`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function downloadProgrammeReport(eventId) {
  return apiDownload(`/events/${eventId}/items/report/programme`);
}

export function downloadLuckyDrawResultsReport(eventId) {
  return apiDownload(`/events/${eventId}/items/report/results`);
}

export function downloadAuctionReceiptsReport(eventId) {
  return apiDownload(`/events/${eventId}/items/report/auction-receipts`);
}
