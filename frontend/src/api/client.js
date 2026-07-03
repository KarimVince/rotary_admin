const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

let accessToken = null;

export function setAccessToken(token) {
  accessToken = token;
}

export class ApiError extends Error {
  constructor(status, detail) {
    super(detail || `API request failed: ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

export async function apiFetch(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (!response.ok) {
    let detail;
    try {
      const body = await response.json();
      detail = typeof body.detail === "string" ? body.detail : undefined;
    } catch {
      // response had no JSON body — fall back to the generic message
    }
    throw new ApiError(response.status, detail);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}
