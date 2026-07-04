import { apiFetch } from "./client";

export function listMemberTitles({ includeInactive = false } = {}) {
  const query = includeInactive ? "?include_inactive=true" : "";
  return apiFetch(`/member-titles${query}`);
}

export function createMemberTitle(payload) {
  return apiFetch("/member-titles", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateMemberTitle(titleId, payload) {
  return apiFetch(`/member-titles/${titleId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deactivateMemberTitle(titleId) {
  return apiFetch(`/member-titles/${titleId}`, {
    method: "DELETE",
  });
}
