import { apiFetch } from "./client";

export function listAppFunctions({ includeInactive = false } = {}) {
  const query = includeInactive ? "?include_inactive=true" : "";
  return apiFetch(`/board/app-functions${query}`);
}

export function getPermissionMatrix() {
  return apiFetch("/board/permissions/matrix");
}

export function upsertPermissionMatrixCell(payload) {
  return apiFetch("/board/permissions/matrix/cell", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function fetchMyPermissions() {
  return apiFetch("/board/permissions/me");
}
