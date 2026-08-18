import { apiDownload, apiFetch, apiUpload } from "./client";

export function listEventMinutes(eventId) {
  return apiFetch(`/attendance/events/${eventId}/minutes`);
}

export function createTextMinutes(eventId, contentText) {
  return apiFetch(`/attendance/events/${eventId}/minutes/text`, {
    method: "POST",
    body: JSON.stringify({ content_text: contentText }),
  });
}

export function updateTextMinutes(eventId, minutesId, contentText) {
  return apiFetch(`/attendance/events/${eventId}/minutes/${minutesId}/text`, {
    method: "PUT",
    body: JSON.stringify({ content_text: contentText }),
  });
}

export function createFileMinutes(eventId, file) {
  const formData = new FormData();
  formData.append("file", file);
  return apiUpload(`/attendance/events/${eventId}/minutes/file`, formData);
}

export function replaceFileMinutes(eventId, minutesId, file) {
  const formData = new FormData();
  formData.append("file", file);
  return apiUpload(`/attendance/events/${eventId}/minutes/${minutesId}/file`, formData);
}

export function deleteEventMinutes(eventId, minutesId) {
  return apiFetch(`/attendance/events/${eventId}/minutes/${minutesId}`, { method: "DELETE" });
}

// The download endpoint is on the private `event-minutes` bucket, so — unlike
// a public-assets URL — it needs the Bearer auth header, hence apiDownload
// (blob fetch) rather than a plain <a href>.
export function downloadEventMinutesFile(eventId, minutesId) {
  return apiDownload(`/attendance/events/${eventId}/minutes/${minutesId}/download`);
}
