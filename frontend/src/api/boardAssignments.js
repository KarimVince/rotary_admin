import { apiDownload, apiFetch } from "./client";

export function listBoardAssignments(year) {
  return apiFetch(`/board/assignments?year=${year}`);
}

// Board Members report — same card-based design and chrome-variant toggle
// as the NGO Statistics report's own `generateDonationStatisticsReport`.
export function generateBoardMembersReport(
  format,
  { year, useTemplate = false, includeNonBoard = false } = {},
) {
  const params = new URLSearchParams({ format, year: String(year) });
  if (useTemplate) params.set("use_template", "true");
  if (includeNonBoard) params.set("include_non_board", "true");
  return apiDownload(`/board/assignments/report?${params.toString()}`, { method: "POST" });
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
