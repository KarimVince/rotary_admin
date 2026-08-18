import { apiFetch } from "./client";

export function changeAccountPassword(currentPassword, newPassword) {
  return apiFetch("/account/password", {
    method: "PUT",
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

export function requestAccountEmailChange(newEmail, currentPassword) {
  return apiFetch("/account/email/request", {
    method: "POST",
    body: JSON.stringify({ new_email: newEmail, current_password: currentPassword }),
  });
}

export function confirmAccountEmailChange(token) {
  return apiFetch("/account/email/confirm", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}
