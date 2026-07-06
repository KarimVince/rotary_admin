import { apiFetch } from "./client";

export function sendRotaryFriendEmail(payload) {
  return apiFetch("/rotary-friends/email", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listRotaryFriendEmailLog() {
  return apiFetch("/rotary-friends/email-log");
}
