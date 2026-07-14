import { apiFetch } from "./client";

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
