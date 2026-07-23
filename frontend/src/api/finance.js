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

export function fetchFinanceSummary(filters = {}) {
  return apiFetch(`/finance/summary${buildQuery(filters)}`);
}

export function listAdhocDonations(filters = {}) {
  return apiFetch(`/adhoc-donations${buildQuery(filters)}`);
}

export function createAdhocDonation(payload) {
  return apiFetch("/adhoc-donations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAdhocDonation(donationId, payload) {
  return apiFetch(`/adhoc-donations/${donationId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteAdhocDonation(donationId) {
  return apiFetch(`/adhoc-donations/${donationId}`, {
    method: "DELETE",
  });
}

export function fetchFundraisingSummary(filters = {}) {
  return apiFetch(`/finance/fundraising-summary${buildQuery(filters)}`);
}

export function listOperationalEntries(filters = {}) {
  return apiFetch(`/operational-entries${buildQuery(filters)}`);
}

export function createOperationalEntry(payload) {
  return apiFetch("/operational-entries", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateOperationalEntry(entryId, payload) {
  return apiFetch(`/operational-entries/${entryId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteOperationalEntry(entryId) {
  return apiFetch(`/operational-entries/${entryId}`, {
    method: "DELETE",
  });
}

export function fetchOperationalSummary(filters = {}) {
  return apiFetch(`/finance/operational-summary${buildQuery(filters)}`);
}
