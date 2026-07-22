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

export function listOrganisationServiceHours(organisationId) {
  return apiFetch(`/organisations/${organisationId}/service-hours`);
}

export function createServiceHour(organisationId, payload) {
  return apiFetch(`/organisations/${organisationId}/service-hours`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateServiceHour(serviceHourId, payload) {
  return apiFetch(`/service-hours/${serviceHourId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteServiceHour(serviceHourId) {
  return apiFetch(`/service-hours/${serviceHourId}`, {
    method: "DELETE",
  });
}

export function listServiceHours(filters = {}) {
  return apiFetch(`/service-hours${buildQuery(filters)}`);
}
