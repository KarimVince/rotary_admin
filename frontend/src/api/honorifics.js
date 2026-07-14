import { apiFetch } from "./client";

export function listHonorifics({ includeInactive = false } = {}) {
  const query = includeInactive ? "?include_inactive=true" : "";
  return apiFetch(`/honorifics${query}`);
}

export function createHonorific(payload) {
  return apiFetch("/honorifics", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateHonorific(honorificId, payload) {
  return apiFetch(`/honorifics/${honorificId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deactivateHonorific(honorificId) {
  return apiFetch(`/honorifics/${honorificId}`, {
    method: "DELETE",
  });
}
