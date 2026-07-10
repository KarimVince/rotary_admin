import { apiFetch } from "./client";

export function listBoardAssignments(year) {
  return apiFetch(`/board/assignments?year=${year}`);
}

export function createBoardAssignment(payload) {
  return apiFetch("/board/assignments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateBoardAssignment(assignmentId, payload) {
  return apiFetch(`/board/assignments/${assignmentId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
