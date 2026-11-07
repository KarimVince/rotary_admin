import { apiDownload, apiFetch, apiUpload } from "./client";

// NGO Project File — one record per NGO per rotary year (plan, objectives,
// outcome, lead member) plus uploaded documents. Addressed by rotary year.

export function listServiceProjects(organisationId) {
  return apiFetch(`/organisations/${organisationId}/service-projects`);
}

export function saveServiceProject(organisationId, rotaryYear, payload) {
  return apiFetch(`/organisations/${organisationId}/service-projects/${rotaryYear}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteServiceProject(organisationId, rotaryYear) {
  return apiFetch(`/organisations/${organisationId}/service-projects/${rotaryYear}`, {
    method: "DELETE",
  });
}

export function uploadServiceProjectDocument(organisationId, rotaryYear, file, description) {
  const formData = new FormData();
  formData.append("file", file);
  if (description) formData.append("description", description);
  return apiUpload(
    `/organisations/${organisationId}/service-projects/${rotaryYear}/documents`,
    formData,
  );
}

export function deleteServiceProjectDocument(organisationId, rotaryYear, documentId) {
  return apiFetch(
    `/organisations/${organisationId}/service-projects/${rotaryYear}/documents/${documentId}`,
    { method: "DELETE" },
  );
}

// Private bucket — needs the Bearer header, hence a blob fetch rather than
// a plain <a href> (same as Event Minutes downloads).
export function downloadServiceProjectDocument(organisationId, rotaryYear, documentId) {
  return apiDownload(
    `/organisations/${organisationId}/service-projects/${rotaryYear}/documents/${documentId}/download`,
  );
}
