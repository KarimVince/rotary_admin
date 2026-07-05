import { apiDownload, apiFetch } from "./client";

export function fetchMemberStatistics() {
  return apiFetch("/members/statistics");
}

export function generateStatisticsReport(format) {
  return apiDownload(`/members/statistics/report?format=${format}`, { method: "POST" });
}
