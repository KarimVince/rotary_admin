import { apiFetch } from "./client";

export function sendMemberEmail(payload) {
  return apiFetch("/members/email", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listEmailLog() {
  return apiFetch("/members/email-log");
}
