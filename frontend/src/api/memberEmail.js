import { apiFetch, apiUpload } from "./client";

export function sendMemberEmail(payload) {
  return apiFetch("/members/email", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listEmailLog() {
  return apiFetch("/members/email-log");
}

export function uploadEmailAttachment(file) {
  const formData = new FormData();
  formData.append("file", file);
  return apiUpload("/members/email/attachments", formData);
}
