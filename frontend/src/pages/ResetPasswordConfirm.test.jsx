import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { server } from "../test/mocks/server";
import ResetPasswordConfirm from "./ResetPasswordConfirm";

const API_BASE_URL = "http://localhost:8000/api/v1";

function renderPage(token = "valid-token") {
  render(
    <MemoryRouter initialEntries={[`/reset-password?token=${token}`]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordConfirm />} />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ResetPasswordConfirm", () => {
  it("submits the token and new password, then shows a success message", async () => {
    let capturedBody;
    server.use(
      http.post(`${API_BASE_URL}/auth/reset-password`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ detail: "Password updated" });
      }),
    );

    renderPage("abc123");

    await userEvent.type(screen.getByLabelText(/^new password$/i), "brand-new-password");
    await userEvent.type(screen.getByLabelText(/confirm new password/i), "brand-new-password");
    await userEvent.click(screen.getByRole("button", { name: /reset password/i }));

    expect(await screen.findByText(/password has been updated/i)).toBeInTheDocument();
    expect(capturedBody).toEqual({ token: "abc123", new_password: "brand-new-password" });
  });

  it("shows a client-side error when passwords don't match", async () => {
    renderPage("abc123");

    await userEvent.type(screen.getByLabelText(/^new password$/i), "password-one");
    await userEvent.type(screen.getByLabelText(/confirm new password/i), "password-two");
    await userEvent.click(screen.getByRole("button", { name: /reset password/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/do not match/i);
  });

  it("shows a server error for an invalid or expired token", async () => {
    server.use(
      http.post(`${API_BASE_URL}/auth/reset-password`, () =>
        HttpResponse.json({ detail: "Invalid or expired reset link" }, { status: 400 }),
      ),
    );

    renderPage("expired-token");

    await userEvent.type(screen.getByLabelText(/^new password$/i), "brand-new-password");
    await userEvent.type(screen.getByLabelText(/confirm new password/i), "brand-new-password");
    await userEvent.click(screen.getByRole("button", { name: /reset password/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid or expired reset link/i);
  });

  it("disables the submit button and shows a message when the token is missing", () => {
    renderPage("");

    expect(screen.getByText(/missing its token/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reset password/i })).toBeDisabled();
  });
});
