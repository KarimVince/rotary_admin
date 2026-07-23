import { apiFetch } from "./client";

export function listRotaryYears() {
  return apiFetch("/rotary-years");
}

export function createRotaryYear(payload) {
  return apiFetch("/rotary-years", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateRotaryYear(rotaryYearId, payload) {
  return apiFetch(`/rotary-years/${rotaryYearId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteRotaryYear(rotaryYearId) {
  return apiFetch(`/rotary-years/${rotaryYearId}`, {
    method: "DELETE",
  });
}
