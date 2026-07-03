import { apiFetch } from "./client";

export function loginRequest(email, password) {
  return apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function refreshRequest(refreshToken) {
  return apiFetch("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

export function fetchCurrentUser() {
  return apiFetch("/auth/me");
}
