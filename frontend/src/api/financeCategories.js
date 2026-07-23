import { apiFetch } from "./client";

export function listFinanceCategories({ includeInactive = false } = {}) {
  const query = includeInactive ? "?include_inactive=true" : "";
  return apiFetch(`/finance-categories${query}`);
}

export function createFinanceCategory(payload) {
  return apiFetch("/finance-categories", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateFinanceCategory(categoryId, payload) {
  return apiFetch(`/finance-categories/${categoryId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deactivateFinanceCategory(categoryId) {
  return apiFetch(`/finance-categories/${categoryId}`, {
    method: "DELETE",
  });
}
