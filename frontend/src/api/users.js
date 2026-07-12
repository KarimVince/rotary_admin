import { apiFetch } from "./client";

export function listUsers() {
  return apiFetch("/users");
}

export function createUser(payload) {
  return apiFetch("/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateUser(userId, payload) {
  return apiFetch(`/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function resetUserPassword(userId) {
  return apiFetch(`/users/${userId}/reset-password`, {
    method: "POST",
  });
}

export function deleteUser(userId) {
  return apiFetch(`/users/${userId}`, {
    method: "DELETE",
  });
}
