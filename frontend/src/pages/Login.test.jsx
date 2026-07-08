import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { server } from "../test/mocks/server";
import Login from "./Login";

const API_BASE_URL = "http://localhost:8000/api/v1";

const MOCK_TOKENS = { access_token: "tok", refresh_token: "ref", token_type: "bearer" };

function renderLogin(initialPath = "/login", initialState = undefined) {
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[{ pathname: initialPath, state: initialState }]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<div>Dashboard page</div>} />
          <Route path="/members" element={<div>Members page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

async function fillAndSubmit(email = "admin@rotaryadmin.app", password = "change-me") {
  await userEvent.type(screen.getByLabelText(/email/i), email);
  await userEvent.type(screen.getByLabelText(/password/i), password);
  await userEvent.click(screen.getByRole("button", { name: /log in/i }));
}

describe("Login — post-login redirect", () => {
  it("redirects to /dashboard after a plain login with no prior location", async () => {
    server.use(
      http.post(`${API_BASE_URL}/auth/login`, () => HttpResponse.json(MOCK_TOKENS)),
    );

    renderLogin();
    await fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText("Dashboard page")).toBeInTheDocument(),
    );
  });

  it("redirects back to the originally requested page when login was triggered by a redirect", async () => {
    server.use(
      http.post(`${API_BASE_URL}/auth/login`, () => HttpResponse.json(MOCK_TOKENS)),
    );

    // Simulate ProtectedRoute setting state.from before redirecting to /login
    renderLogin("/login", { from: "/members" });
    await fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText("Members page")).toBeInTheDocument(),
    );
  });

  it("shows an error and stays on login when credentials are wrong", async () => {
    server.use(
      http.post(`${API_BASE_URL}/auth/login`, () =>
        HttpResponse.json({ detail: "Invalid email or password" }, { status: 401 }),
      ),
    );

    renderLogin();
    await fillAndSubmit("wrong@example.com", "badpass");

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid email or password/i);
    expect(screen.getByRole("button", { name: /log in/i })).toBeInTheDocument();
  });
});
