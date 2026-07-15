import { apiDownload, apiFetch } from "./client";

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

export function listRotaryFriends(filters = {}) {
  return apiFetch(`/rotary-friends${buildQuery(filters)}`);
}

export function createRotaryFriend(payload) {
  return apiFetch("/rotary-friends", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateRotaryFriend(friendId, payload) {
  return apiFetch(`/rotary-friends/${friendId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteRotaryFriend(friendId) {
  return apiFetch(`/rotary-friends/${friendId}`, {
    method: "DELETE",
  });
}

export function fetchRotaryFriendStatistics() {
  return apiFetch("/rotary-friends/statistics");
}

export function generateRotaryFriendStatisticsReport(format, { reportType = "simplified", useTemplate = false } = {}) {
  const params = new URLSearchParams({ format, type: reportType });
  if (useTemplate) params.set("use_template", "true");
  return apiDownload(`/rotary-friends/statistics/report?${params.toString()}`, { method: "POST" });
}
