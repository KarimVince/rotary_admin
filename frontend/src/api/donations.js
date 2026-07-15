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

export function listOrganisationDonations(organisationId) {
  return apiFetch(`/organisations/${organisationId}/donations`);
}

export function createDonation(organisationId, payload) {
  return apiFetch(`/organisations/${organisationId}/donations`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateDonation(donationId, payload) {
  return apiFetch(`/donations/${donationId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteDonation(donationId) {
  return apiFetch(`/donations/${donationId}`, {
    method: "DELETE",
  });
}

export function listDonations(filters = {}) {
  return apiFetch(`/donations${buildQuery(filters)}`);
}

export function fetchDonationStatistics(filters = {}) {
  return apiFetch(`/donations/statistics${buildQuery(filters)}`);
}

export function generateDonationStatisticsReport(
  format,
  { reportType = "simplified", useTemplate = false, rotaryYear, classificationId, currency } = {},
) {
  const params = new URLSearchParams({ format, type: reportType });
  if (useTemplate) params.set("use_template", "true");
  if (rotaryYear !== undefined && rotaryYear !== null) params.set("rotary_year", rotaryYear);
  if (classificationId) params.set("classification_id", classificationId);
  if (currency) params.set("currency", currency);
  return apiDownload(`/donations/statistics/report?${params.toString()}`, { method: "POST" });
}
