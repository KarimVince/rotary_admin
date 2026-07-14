import { apiDownload, apiFetch } from "./client";

export function createMemberApplication(payload) {
  return apiFetch("/member-applications", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function sendMemberApplication(applicationId, channel) {
  return apiFetch(`/member-applications/${applicationId}/send`, {
    method: "POST",
    body: JSON.stringify({ channel }),
  });
}

// Story 15.11 — filename comes from the backend's Content-Disposition
// header (generate_report_filename), same pattern as the other reports.
export function downloadMemberApplication(applicationId) {
  return apiDownload(`/member-applications/${applicationId}/download`);
}
