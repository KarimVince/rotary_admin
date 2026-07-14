import { apiDownload, apiFetch } from "./client";

export function fetchMemberStatistics() {
  return apiFetch("/members/statistics");
}

export function generateStatisticsReport(format, { reportType = "simplified", useTemplate = false } = {}) {
  const params = new URLSearchParams({ format, type: reportType });
  if (useTemplate) params.set("use_template", "true");
  return apiDownload(`/members/statistics/report?${params.toString()}`, { method: "POST" });
}
