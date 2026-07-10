import { apiFetch } from "./client";

export function listMemberFees(rotaryYear) {
  return apiFetch(`/fee-runs/${rotaryYear}`);
}

export function createFeeRun(payload) {
  return apiFetch("/fee-runs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function sendFeeInvoices(rotaryYear, payload) {
  return apiFetch(`/fee-runs/${rotaryYear}/send`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
