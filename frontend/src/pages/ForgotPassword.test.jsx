import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { server } from "../test/mocks/server";
import { ThemeProvider } from "../context/ThemeContext";
import ForgotPassword from "./ForgotPassword";

const API_BASE_URL = "http://localhost:8000/api/v1";

function renderPage() {
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={["/forgot-password"]}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/login" element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe("ForgotPassword", () => {
  it("submits the email and shows the generic success message", async () => {
    let capturedBody;
    server.use(
      http.post(`${API_BASE_URL}/auth/forgot-password`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          detail: "If that email is registered, we've sent a password reset link to it.",
        });
      }),
    );

    renderPage();
    await userEvent.type(screen.getByLabelText(/^email$/i), "someone@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByText(/if that email is registered/i)).toBeInTheDocument();
    expect(capturedBody).toEqual({ email: "someone@example.com" });
  });

  it("shows the same generic success message even for an unregistered email", async () => {
    server.use(
      http.post(`${API_BASE_URL}/auth/forgot-password`, () =>
        HttpResponse.json({
          detail: "If that email is registered, we've sent a password reset link to it.",
        }),
      ),
    );

    renderPage();
    await userEvent.type(screen.getByLabelText(/^email$/i), "nobody@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByText(/if that email is registered/i)).toBeInTheDocument();
  });

  it("shows a server error on genuine failure (not an account-existence leak)", async () => {
    server.use(
      http.post(`${API_BASE_URL}/auth/forgot-password`, () =>
        HttpResponse.json({ detail: "Internal server error" }, { status: 500 }),
      ),
    );

    renderPage();
    await userEvent.type(screen.getByLabelText(/^email$/i), "someone@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/internal server error/i);
  });
});
