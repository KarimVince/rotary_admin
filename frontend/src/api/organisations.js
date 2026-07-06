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

export function listOrganisations(filters = {}) {
  return apiFetch(`/organisations${buildQuery(filters)}`);
}

export function getOrganisation(organisationId) {
  return apiFetch(`/organisations/${organisationId}`);
}

export function createOrganisation(payload) {
  return apiFetch("/organisations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateOrganisation(organisationId, payload) {
  return apiFetch(`/organisations/${organisationId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteOrganisation(organisationId) {
  return apiFetch(`/organisations/${organisationId}`, {
    method: "DELETE",
  });
}
