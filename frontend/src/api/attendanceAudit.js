import { apiDownload, apiFetch, apiUpload } from "./client";

export function listAttendanceAudits(eventId) {
  return apiFetch(`/attendance/events/${eventId}/audit`);
}

export function uploadAttendanceAudit(eventId, file) {
  const formData = new FormData();
  formData.append("file", file);
  return apiUpload(`/attendance/events/${eventId}/audit`, formData);
}

export function deleteAttendanceAudit(eventId, auditId) {
  return apiFetch(`/attendance/events/${eventId}/audit/${auditId}`, { method: "DELETE" });
}

// Private-bucket download (same reasoning as downloadEventMinutesFile) —
// needs the Bearer auth header, hence a blob fetch rather than a plain
// <a href>.
export function downloadAttendanceAudit(eventId, auditId) {
  return apiDownload(`/attendance/events/${eventId}/audit/${auditId}/download`);
}
