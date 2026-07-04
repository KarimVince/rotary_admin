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

export function listMembers(filters = {}) {
  return apiFetch(`/members${buildQuery(filters)}`);
}

export function getMember(memberId) {
  return apiFetch(`/members/${memberId}`);
}

export function createMember(payload) {
  return apiFetch("/members", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateMember(memberId, payload) {
  return apiFetch(`/members/${memberId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function markMemberPast(memberId) {
  return apiFetch(`/members/${memberId}`, {
    method: "DELETE",
  });
}
