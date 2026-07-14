import { apiFetch, apiUpload } from "./client";

export function fetchCurrentPptTemplate() {
  return apiFetch("/ppt-templates/current");
}

export function uploadPptTemplate(file) {
  const formData = new FormData();
  formData.append("file", file);
  return apiUpload("/ppt-templates", formData);
}

export function deletePptTemplate() {
  return apiFetch("/ppt-templates", { method: "DELETE" });
}
