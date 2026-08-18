import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../test/mocks/server";
import { ThemeProvider } from "../context/ThemeContext";
import AccountSettingsPopover from "./AccountSettingsPopover";

const API_BASE_URL = "http://localhost:8000/api/v1";
const USER = { email: "jane@example.com", full_name: "Jane Doe", role: "user" };

function renderPopover() {
  return render(
    <ThemeProvider>
      <AccountSettingsPopover user={USER}>
        <span>Jane Doe</span>
      </AccountSettingsPopover>
    </ThemeProvider>,
  );
}

describe("AccountSettingsPopover", () => {
  it("is closed by default and opens on trigger click", async () => {
    renderPopover();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /account settings/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/jane@example.com/i)).toBeInTheDocument();
  });

  it("closes when clicking outside", async () => {
    render(
      <ThemeProvider>
        <div>
          <AccountSettingsPopover user={USER}>
            <span>Jane Doe</span>
          </AccountSettingsPopover>
          <button type="button">outside</button>
        </div>
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: /account settings/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^outside$/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("requests an email change with the new email and current password", async () => {
    let capturedBody;
    server.use(
      http.post(`${API_BASE_URL}/account/email/request`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ detail: "Verification email sent to the new address" });
      }),
    );

    renderPopover();
    await userEvent.click(screen.getByRole("button", { name: /account settings/i }));

    await userEvent.type(screen.getByLabelText(/new email/i), "new@example.com");
    await userEvent.type(screen.getByLabelText(/current password/i), "my-password");
    await userEvent.click(screen.getByRole("button", { name: /send verification link/i }));

    expect(await screen.findByText(/verification email sent to new@example.com/i)).toBeInTheDocument();
    expect(capturedBody).toEqual({ new_email: "new@example.com", current_password: "my-password" });
  });

  it("shows an error when the email change request fails", async () => {
    server.use(
      http.post(`${API_BASE_URL}/account/email/request`, () =>
        HttpResponse.json({ detail: "Current password is incorrect" }, { status: 400 }),
      ),
    );

    renderPopover();
    await userEvent.click(screen.getByRole("button", { name: /account settings/i }));
    await userEvent.type(screen.getByLabelText(/new email/i), "new@example.com");
    await userEvent.type(screen.getByLabelText(/current password/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /send verification link/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/current password is incorrect/i);
  });

  it("changes the password when the two new-password fields match", async () => {
    let capturedBody;
    server.use(
      http.put(`${API_BASE_URL}/account/password`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ detail: "Password updated" });
      }),
    );

    renderPopover();
    await userEvent.click(screen.getByRole("button", { name: /account settings/i }));
    await userEvent.click(screen.getByRole("button", { name: /^password$/i }));

    await userEvent.type(screen.getByLabelText(/^current password$/i), "old-password");
    await userEvent.type(screen.getByLabelText(/^new password$/i), "new-password123");
    await userEvent.type(screen.getByLabelText(/confirm new password/i), "new-password123");
    await userEvent.click(screen.getByRole("button", { name: /change password/i }));

    expect(await screen.findByText(/password updated/i)).toBeInTheDocument();
    expect(capturedBody).toEqual({
      current_password: "old-password",
      new_password: "new-password123",
    });
  });

  it("shows a client-side error when new passwords don't match", async () => {
    renderPopover();
    await userEvent.click(screen.getByRole("button", { name: /account settings/i }));
    await userEvent.click(screen.getByRole("button", { name: /^password$/i }));

    await userEvent.type(screen.getByLabelText(/^current password$/i), "old-password");
    await userEvent.type(screen.getByLabelText(/^new password$/i), "password-one");
    await userEvent.type(screen.getByLabelText(/confirm new password/i), "password-two");
    await userEvent.click(screen.getByRole("button", { name: /change password/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/do not match/i);
  });
});
