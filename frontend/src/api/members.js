import { apiFetch, apiUpload } from "./client";

function buildQuery(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    // Title/nationality filters are multi-select — an array value becomes
    // one repeated query param per entry (`title_id=a&title_id=b`),
    // matching FastAPI's `list[...]` query parsing (see dinnerForecast.js's
    // event_type filter for the same pattern).
    if (Array.isArray(value)) {
      if (value.length === 0) return;
      value.forEach((entry) => query.append(key, entry));
    } else {
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

export function uploadMemberPhoto(file) {
  const formData = new FormData();
  formData.append("file", file);
  return apiUpload("/members/photo", formData);
}
