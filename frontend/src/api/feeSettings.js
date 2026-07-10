import { apiFetch } from "./client";

export function listFeeSettings() {
  return apiFetch("/fee-settings");
}

export function getFeeSettings(rotaryYear) {
  return apiFetch(`/fee-settings/${rotaryYear}`);
}

export function createFeeSettings(payload) {
  return apiFetch("/fee-settings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateFeeSettings(rotaryYear, payload) {
  return apiFetch(`/fee-settings/${rotaryYear}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
