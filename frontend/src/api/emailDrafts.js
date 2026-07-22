import { apiFetch } from "./client";

export function listEmailDrafts(sourceModule) {
  return apiFetch(`/email-drafts?source_module=${sourceModule}`);
}

export function createEmailDraft(payload) {
  return apiFetch("/email-drafts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateEmailDraft(draftId, payload) {
  return apiFetch(`/email-drafts/${draftId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteEmailDraft(draftId) {
  return apiFetch(`/email-drafts/${draftId}`, {
    method: "DELETE",
  });
}
