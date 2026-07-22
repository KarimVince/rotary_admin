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

export function listMemberFees(filters = {}) {
  return apiFetch(`/member-fees${buildQuery(filters)}`);
}

export function updateMemberFee(memberFeeId, payload) {
  return apiFetch(`/member-fees/${memberFeeId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function fetchMemberFeeStatistics(filters = {}) {
  return apiFetch(`/member-fees/statistics${buildQuery(filters)}`);
}

export function fetchMemberFeeStatisticsHistory() {
  return apiFetch("/member-fees/statistics/history");
}

export function generateMemberFeeStatisticsReport(format, { rotaryYear } = {}) {
  const params = new URLSearchParams({ format });
  if (rotaryYear !== undefined && rotaryYear !== null) {
    params.set("rotary_year", rotaryYear);
  }
  return apiDownload(`/member-fees/statistics/report?${params.toString()}`, { method: "POST" });
}
