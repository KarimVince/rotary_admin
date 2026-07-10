import { apiFetch } from "./client";

export function listBoardPositions({ includeInactive = false } = {}) {
  const query = includeInactive ? "?include_inactive=true" : "";
  return apiFetch(`/board/positions${query}`);
}

export function createBoardPosition(payload) {
  return apiFetch("/board/positions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateBoardPosition(positionId, payload) {
  return apiFetch(`/board/positions/${positionId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deactivateBoardPosition(positionId) {
  return apiFetch(`/board/positions/${positionId}`, {
    method: "DELETE",
  });
}

export function getBoardPositionAssignmentCount(positionId) {
  return apiFetch(`/board/positions/${positionId}/assignment-count`);
}

export function deleteBoardPositionPermanently(positionId) {
  return apiFetch(`/board/positions/${positionId}/permanent`, {
    method: "DELETE",
  });
}
