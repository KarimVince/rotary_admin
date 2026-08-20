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

export function listConnectionLogs(filters = {}) {
  return apiFetch(`/connection-logs${buildQuery(filters)}`);
}

export function fetchConnectionLogStats() {
  return apiFetch("/connection-logs/stats");
}
