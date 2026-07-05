const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";
export const API_ORIGIN = new URL(API_BASE_URL).origin;

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

async function handleResponse(response) {
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

export async function apiFetch(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  return handleResponse(response);
}

export async function apiUpload(path, formData) {
  const headers = {};
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    body: formData,
    headers,
  });
  return handleResponse(response);
}

export async function apiDownload(path, options = {}) {
  const headers = { ...options.headers };
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

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  return { blob, filename: match ? match[1] : "download" };
}
