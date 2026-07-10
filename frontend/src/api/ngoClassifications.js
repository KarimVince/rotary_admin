import { apiFetch } from "./client";

export function listNgoClassifications() {
  return apiFetch("/ngo-classifications");
}

export function createNgoClassification(payload) {
  return apiFetch("/ngo-classifications", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateNgoClassification(classificationId, payload) {
  return apiFetch(`/ngo-classifications/${classificationId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function reorderNgoClassifications(items) {
  return apiFetch("/ngo-classifications/reorder", {
    method: "PATCH",
    body: JSON.stringify({ items }),
  });
}

export function deleteNgoClassification(classificationId) {
  return apiFetch(`/ngo-classifications/${classificationId}`, {
    method: "DELETE",
  });
}
