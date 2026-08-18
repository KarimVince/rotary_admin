import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { server } from "../test/mocks/server";
import { ThemeProvider } from "../context/ThemeContext";
import ConfirmEmailChange from "./ConfirmEmailChange";

const API_BASE_URL = "http://localhost:8000/api/v1";

function renderPage(token = "valid-token") {
  render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[`/confirm-email?token=${token}`]}>
        <Routes>
          <Route path="/confirm-email" element={<ConfirmEmailChange />} />
          <Route path="/login" element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe("ConfirmEmailChange", () => {
  it("does not call the API until the user clicks Confirm", async () => {
    let called = false;
    server.use(
      http.post(`${API_BASE_URL}/account/email/confirm`, () => {
        called = true;
        return HttpResponse.json({ detail: "Email updated" });
      }),
    );

    renderPage("abc123");
    expect(called).toBe(false);

    await userEvent.click(screen.getByRole("button", { name: /confirm new email/i }));
    expect(await screen.findByText(/email has been updated/i)).toBeInTheDocument();
    expect(called).toBe(true);
  });

  it("sends the token from the URL", async () => {
    let capturedBody;
    server.use(
      http.post(`${API_BASE_URL}/account/email/confirm`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ detail: "Email updated" });
      }),
    );

    renderPage("my-token-value");
    await userEvent.click(screen.getByRole("button", { name: /confirm new email/i }));

    await screen.findByText(/email has been updated/i);
    expect(capturedBody).toEqual({ token: "my-token-value" });
  });

  it("shows a server error for an invalid or expired token", async () => {
    server.use(
      http.post(`${API_BASE_URL}/account/email/confirm`, () =>
        HttpResponse.json({ detail: "Invalid or expired confirmation link" }, { status: 400 }),
      ),
    );

    renderPage("expired-token");
    await userEvent.click(screen.getByRole("button", { name: /confirm new email/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid or expired confirmation link/i);
  });

  it("disables the confirm button and shows a message when the token is missing", () => {
    renderPage("");

    expect(screen.getByText(/missing its token/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm new email/i })).toBeDisabled();
  });
});
