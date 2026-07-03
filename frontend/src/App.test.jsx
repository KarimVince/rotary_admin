import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "./App";
import { server } from "./test/mocks/server";

const API_BASE_URL = "http://localhost:8000/api";

const MOCK_USER = {
  id: "user-1",
  email: "admin@rotaryadmin.app",
  full_name: "Admin",
  role: "admin",
  member_id: null,
  is_active: true,
  created_at: new Date().toISOString(),
};

function renderApp(initialRoute) {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App auth flow", () => {
  it("redirects an unauthenticated visitor to the login page", async () => {
    renderApp("/dashboard");

    expect(await screen.findByRole("heading", { name: /rotary admin/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it("logs in with valid credentials and lands on the protected dashboard", async () => {
    server.use(
      http.post(`${API_BASE_URL}/v1/auth/login`, () =>
        HttpResponse.json({
          access_token: "test-access-token",
          refresh_token: "test-refresh-token",
          token_type: "bearer",
        }),
      ),
      http.get(`${API_BASE_URL}/v1/auth/me`, () => HttpResponse.json(MOCK_USER)),
    );

    renderApp("/login");

    await userEvent.type(screen.getByLabelText(/email/i), "admin@rotaryadmin.app");
    await userEvent.type(screen.getByLabelText(/password/i), "change-me");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText(/welcome, admin/i)).toBeInTheDocument();
  });

  it("shows an error message and stays on the login page for invalid credentials", async () => {
    server.use(
      http.post(`${API_BASE_URL}/v1/auth/login`, () =>
        HttpResponse.json({ detail: "Invalid email or password" }, { status: 401 }),
      ),
    );

    renderApp("/login");

    await userEvent.type(screen.getByLabelText(/email/i), "admin@rotaryadmin.app");
    await userEvent.type(screen.getByLabelText(/password/i), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid email or password/i);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it("restores the session on load from a stored refresh token", async () => {
    localStorage.setItem("rotaryadmin.refresh_token", "stored-refresh-token");
    server.use(
      http.post(`${API_BASE_URL}/v1/auth/refresh`, () =>
        HttpResponse.json({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          token_type: "bearer",
        }),
      ),
      http.get(`${API_BASE_URL}/v1/auth/me`, () => HttpResponse.json(MOCK_USER)),
    );

    renderApp("/dashboard");

    expect(await screen.findByText(/welcome, admin/i)).toBeInTheDocument();
  });

  it("logging out clears the session and returns to the login page", async () => {
    server.use(
      http.post(`${API_BASE_URL}/v1/auth/login`, () =>
        HttpResponse.json({
          access_token: "test-access-token",
          refresh_token: "test-refresh-token",
          token_type: "bearer",
        }),
      ),
      http.get(`${API_BASE_URL}/v1/auth/me`, () => HttpResponse.json(MOCK_USER)),
    );

    renderApp("/login");
    await userEvent.type(screen.getByLabelText(/email/i), "admin@rotaryadmin.app");
    await userEvent.type(screen.getByLabelText(/password/i), "change-me");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));
    await screen.findByText(/welcome, admin/i);

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    expect(await screen.findByLabelText(/email/i)).toBeInTheDocument();
    expect(localStorage.getItem("rotaryadmin.refresh_token")).toBeNull();
  });

  it("lets an admin reach the user management page", async () => {
    localStorage.setItem("rotaryadmin.refresh_token", "stored-refresh-token");
    server.use(
      http.post(`${API_BASE_URL}/v1/auth/refresh`, () =>
        HttpResponse.json({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          token_type: "bearer",
        }),
      ),
      http.get(`${API_BASE_URL}/v1/auth/me`, () => HttpResponse.json(MOCK_USER)),
      http.get(`${API_BASE_URL}/users`, () => HttpResponse.json([])),
    );

    renderApp("/admin/users");

    expect(await screen.findByRole("heading", { name: /user management/i })).toBeInTheDocument();
  });

  it("redirects a non-admin away from the user management page", async () => {
    localStorage.setItem("rotaryadmin.refresh_token", "stored-refresh-token");
    server.use(
      http.post(`${API_BASE_URL}/v1/auth/refresh`, () =>
        HttpResponse.json({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          token_type: "bearer",
        }),
      ),
      http.get(`${API_BASE_URL}/v1/auth/me`, () =>
        HttpResponse.json({ ...MOCK_USER, role: "user" }),
      ),
    );

    renderApp("/admin/users");

    expect(await screen.findByText(/welcome, admin/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /user management/i })).not.toBeInTheDocument();
  });
});
