import { apiFetch } from "./client";

export function loginRequest(email, password) {
  return apiFetch("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function refreshRequest(refreshToken) {
  return apiFetch("/v1/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

export function fetchCurrentUser() {
  return apiFetch("/v1/auth/me");
}
