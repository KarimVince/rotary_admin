import { apiDownload, apiFetch } from "./client";

export function fetchMemberStatistics(asOfDate) {
  const qs = asOfDate ? `?as_of=${asOfDate}` : "";
  return apiFetch(`/members/statistics${qs}`);
}

export function generateStatisticsReport(
  format,
  { reportType = "simplified", useTemplate = false, asOfDate = null } = {},
) {
  const params = new URLSearchParams({ format, type: reportType });
  if (useTemplate) params.set("use_template", "true");
  if (asOfDate) params.set("as_of", asOfDate);
  return apiDownload(`/members/statistics/report?${params.toString()}`, { method: "POST" });
}
