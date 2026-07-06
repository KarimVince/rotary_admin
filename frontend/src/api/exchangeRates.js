import { apiFetch } from "./client";

export function listExchangeRates() {
  return apiFetch("/exchange-rates");
}

export function createExchangeRate(payload) {
  return apiFetch("/exchange-rates", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateExchangeRate(rateId, payload) {
  return apiFetch(`/exchange-rates/${rateId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteExchangeRate(rateId) {
  return apiFetch(`/exchange-rates/${rateId}`, {
    method: "DELETE",
  });
}
