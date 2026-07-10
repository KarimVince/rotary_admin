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
