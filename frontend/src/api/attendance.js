import { apiFetch } from "./client";

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

export function listAttendanceEvents(filters = {}) {
  return apiFetch(`/attendance/events${buildQuery(filters)}`);
}

export function fetchAttendanceStats(filters = {}) {
  return apiFetch(`/attendance/stats${buildQuery(filters)}`);
}

export function createAttendanceEvent(payload) {
  return apiFetch("/attendance/events", { method: "POST", body: JSON.stringify(payload) });
}

export function updateAttendanceEvent(eventId, payload) {
  return apiFetch(`/attendance/events/${eventId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteAttendanceEvent(eventId) {
  return apiFetch(`/attendance/events/${eventId}`, { method: "DELETE" });
}

export function startAttendanceForEvent(eventId) {
  return apiFetch(`/attendance/events/${eventId}/start`, { method: "POST" });
}

export function fetchAttendanceSheet(eventId) {
  return apiFetch(`/attendance/events/${eventId}/sheet`);
}

export function refreshAttendanceList(eventId) {
  return apiFetch(`/attendance/events/${eventId}/refresh`, { method: "POST" });
}

export function updateAttendanceRecord(eventId, memberId, present) {
  return apiFetch(`/attendance/events/${eventId}/records/${memberId}`, {
    method: "PATCH",
    body: JSON.stringify({ present }),
  });
}
