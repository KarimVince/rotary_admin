import { apiFetch } from "./client";

export function fetchActiveImportantInformation() {
  return apiFetch("/important-information/active");
}

export function listImportantInformation() {
  return apiFetch("/important-information");
}

export function createImportantInformation(title, text) {
  return apiFetch("/important-information", {
    method: "POST",
    body: JSON.stringify({ title, text }),
  });
}

export function reactivateImportantInformation(id) {
  return apiFetch(`/important-information/${id}/reactivate`, { method: "POST" });
}

export function deactivateImportantInformation(id) {
  return apiFetch(`/important-information/${id}/deactivate`, { method: "POST" });
}

export function deleteImportantInformation(id) {
  return apiFetch(`/important-information/${id}`, { method: "DELETE" });
}
