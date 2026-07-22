import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import UserManagement from "./UserManagement";

const API_BASE_URL = "http://localhost:8000/api/v1";

const SELF_ADMIN = {
  id: "admin-self",
  email: "admin-self@example.com",
  full_name: "Admin Self",
  role: "admin",
};

const BASE_USER = {
  id: "user-1",
  email: "user1@example.com",
  full_name: "User One",
  role: "user",
  member_id: null,
  is_active: true,
  created_at: new Date().toISOString(),
};

const MEMBER = { id: "member-1", first_name: "Jane", last_name: "Doe" };

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ user: SELF_ADMIN }),
}));

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
}

function mockMembers(members = [MEMBER]) {
  server.use(http.get(`${API_BASE_URL}/members`, () => HttpResponse.json(members)));
}

describe("UserManagement", () => {
  it("lists users fetched from the API", async () => {
    mockMembers();
    server.use(http.get(`${API_BASE_URL}/users`, () => HttpResponse.json([BASE_USER])));

    render(<UserManagement />);

    expect(await screen.findByText("user1@example.com")).toBeInTheDocument();
  });

  it("creates a user and refreshes the list", async () => {
    mockMembers();
    let users = [];
    server.use(
      http.get(`${API_BASE_URL}/users`, () => HttpResponse.json(users)),
      http.post(`${API_BASE_URL}/users`, async ({ request }) => {
        const body = await request.json();
        const created = { ...BASE_USER, id: "user-2", is_active: true, ...body };
        users = [created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    render(<UserManagement />);
    await waitForLoaded();

    await userEvent.type(screen.getByLabelText(/^email$/i), "new@example.com");
    await userEvent.type(screen.getByLabelText(/full name/i), "New Person");
    await userEvent.type(screen.getByLabelText(/temporary password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /create user/i }));

    expect(await screen.findByText("new@example.com")).toBeInTheDocument();
  });

  it("shows an error and keeps the form when creation fails", async () => {
    mockMembers();
    server.use(
      http.get(`${API_BASE_URL}/users`, () => HttpResponse.json([])),
      http.post(`${API_BASE_URL}/users`, () =>
        HttpResponse.json({ detail: "Email already registered" }, { status: 409 }),
      ),
    );

    render(<UserManagement />);
    await waitForLoaded();

    await userEvent.type(screen.getByLabelText(/^email$/i), "dup@example.com");
    await userEvent.type(screen.getByLabelText(/full name/i), "Dup Person");
    await userEvent.type(screen.getByLabelText(/temporary password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /create user/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/email already registered/i);
  });

  it("toggles a user's active status", async () => {
    mockMembers();
    let currentUser = { ...BASE_USER };
    server.use(
      http.get(`${API_BASE_URL}/users`, () => HttpResponse.json([currentUser])),
      http.patch(`${API_BASE_URL}/users/${BASE_USER.id}`, async ({ request }) => {
        currentUser = { ...currentUser, ...(await request.json()) };
        return HttpResponse.json(currentUser);
      }),
    );

    render(<UserManagement />);
    await screen.findByText("user1@example.com");
    expect(screen.getByText("Active")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /deactivate/i }));

    expect(await screen.findByText("Inactive")).toBeInTheDocument();
  });

  it("changes a user's role", async () => {
    mockMembers();
    let currentUser = { ...BASE_USER };
    server.use(
      http.get(`${API_BASE_URL}/users`, () => HttpResponse.json([currentUser])),
      http.patch(`${API_BASE_URL}/users/${BASE_USER.id}`, async ({ request }) => {
        currentUser = { ...currentUser, ...(await request.json()) };
        return HttpResponse.json(currentUser);
      }),
    );

    render(<UserManagement />);
    await screen.findByText("user1@example.com");

    await userEvent.selectOptions(
      screen.getByLabelText(/role for user1@example.com/i),
      "admin",
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/role for user1@example.com/i)).toHaveValue("admin"),
    );
  });

  describe("editing a user", () => {
    it("opens the edit modal pre-filled and saves changes", async () => {
      mockMembers();
      let currentUser = { ...BASE_USER };
      server.use(
        http.get(`${API_BASE_URL}/users`, () => HttpResponse.json([currentUser])),
        http.patch(`${API_BASE_URL}/users/${BASE_USER.id}`, async ({ request }) => {
          currentUser = { ...currentUser, ...(await request.json()) };
          return HttpResponse.json(currentUser);
        }),
      );

      render(<UserManagement />);
      await screen.findByText("user1@example.com");

      await userEvent.click(screen.getByRole("button", { name: /^edit$/i }));
      const dialog = screen.getByRole("dialog", { name: /edit user/i });

      expect(within(dialog).getByLabelText(/full name/i)).toHaveValue("User One");
      expect(within(dialog).getByLabelText(/^email$/i)).toHaveValue("user1@example.com");

      const nameInput = within(dialog).getByLabelText(/full name/i);
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, "Updated Name");

      await userEvent.selectOptions(within(dialog).getByLabelText(/linked member/i), "member-1");

      await userEvent.click(within(dialog).getByRole("button", { name: /update user/i }));

      expect(await screen.findByText("Updated Name")).toBeInTheDocument();
    });

    it("shows an error when the update fails", async () => {
      mockMembers();
      server.use(
        http.get(`${API_BASE_URL}/users`, () => HttpResponse.json([BASE_USER])),
        http.patch(`${API_BASE_URL}/users/${BASE_USER.id}`, () =>
          HttpResponse.json({ detail: "Email already registered" }, { status: 409 }),
        ),
      );

      render(<UserManagement />);
      await screen.findByText("user1@example.com");

      await userEvent.click(screen.getByRole("button", { name: /^edit$/i }));
      const dialog = screen.getByRole("dialog", { name: /edit user/i });
      await userEvent.click(within(dialog).getByRole("button", { name: /update user/i }));

      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        /email already registered/i,
      );
    });

    it("disables role and active controls when editing your own account", async () => {
      mockMembers();
      const selfAsUser = { ...BASE_USER, id: SELF_ADMIN.id, email: SELF_ADMIN.email };
      server.use(http.get(`${API_BASE_URL}/users`, () => HttpResponse.json([selfAsUser])));

      render(<UserManagement />);
      await screen.findByText(SELF_ADMIN.email);

      expect(screen.getByLabelText(new RegExp(`role for ${SELF_ADMIN.email}`, "i"))).toBeDisabled();

      await userEvent.click(screen.getByRole("button", { name: /^edit$/i }));
      const dialog = screen.getByRole("dialog", { name: /edit user/i });

      expect(within(dialog).getByLabelText(/^role$/i)).toBeDisabled();
      expect(within(dialog).getByLabelText(/active/i)).toBeDisabled();
      expect(screen.getByRole("button", { name: /^delete$/i })).toBeDisabled();
    });
  });

  describe("resetting a password", () => {
    it("shows a confirmation before sending the reset email", async () => {
      mockMembers();
      server.use(http.get(`${API_BASE_URL}/users`, () => HttpResponse.json([BASE_USER])));

      render(<UserManagement />);
      await screen.findByText("user1@example.com");

      await userEvent.click(screen.getByRole("button", { name: /reset password/i }));

      expect(screen.getByRole("alertdialog")).toHaveTextContent("user1@example.com");
    });

    it("sends the reset email after confirmation", async () => {
      mockMembers();
      let resetCalled = false;
      server.use(
        http.get(`${API_BASE_URL}/users`, () => HttpResponse.json([BASE_USER])),
        http.post(`${API_BASE_URL}/users/${BASE_USER.id}/reset-password`, () => {
          resetCalled = true;
          return HttpResponse.json({ detail: "Password reset email sent" });
        }),
      );

      render(<UserManagement />);
      await screen.findByText("user1@example.com");

      await userEvent.click(screen.getByRole("button", { name: /reset password/i }));
      await userEvent.click(screen.getByRole("button", { name: /confirm send/i }));

      await waitFor(() => expect(resetCalled).toBe(true));
      expect(await screen.findByText(/reset email sent/i)).toBeInTheDocument();
    });

    it("shows an error when the reset email fails to send", async () => {
      mockMembers();
      server.use(
        http.get(`${API_BASE_URL}/users`, () => HttpResponse.json([BASE_USER])),
        http.post(`${API_BASE_URL}/users/${BASE_USER.id}/reset-password`, () =>
          HttpResponse.json({ detail: "Failed to send password reset email" }, { status: 502 }),
        ),
      );

      render(<UserManagement />);
      await screen.findByText("user1@example.com");

      await userEvent.click(screen.getByRole("button", { name: /reset password/i }));
      await userEvent.click(screen.getByRole("button", { name: /confirm send/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/failed to send/i);
    });
  });

  describe("deleting a user", () => {
    it("shows a confirmation dialog with the user's name before deleting", async () => {
      mockMembers();
      server.use(http.get(`${API_BASE_URL}/users`, () => HttpResponse.json([BASE_USER])));

      render(<UserManagement />);
      await screen.findByText("user1@example.com");

      await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

      expect(screen.getByRole("alertdialog")).toHaveTextContent("User One");
      expect(screen.getByRole("alertdialog")).toHaveTextContent(/cannot be undone/i);
    });

    it("removes the row after confirming deletion", async () => {
      mockMembers();
      let users = [BASE_USER];
      let deleteCalled = false;
      server.use(
        http.get(`${API_BASE_URL}/users`, () => HttpResponse.json(users)),
        http.delete(`${API_BASE_URL}/users/${BASE_USER.id}`, () => {
          deleteCalled = true;
          users = [];
          return new HttpResponse(null, { status: 204 });
        }),
      );

      render(<UserManagement />);
      await screen.findByText("user1@example.com");

      await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
      await userEvent.click(screen.getByRole("button", { name: /confirm delete/i }));

      await waitFor(() => expect(deleteCalled).toBe(true));
      await waitFor(() =>
        expect(screen.queryByText("user1@example.com")).not.toBeInTheDocument(),
      );
    });

    it("cancelling the dialog makes no changes", async () => {
      mockMembers();
      server.use(http.get(`${API_BASE_URL}/users`, () => HttpResponse.json([BASE_USER])));

      render(<UserManagement />);
      await screen.findByText("user1@example.com");

      await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
      await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(screen.getByText("user1@example.com")).toBeInTheDocument();
    });

    it("shows an error and keeps the row when deletion fails", async () => {
      mockMembers();
      server.use(
        http.get(`${API_BASE_URL}/users`, () => HttpResponse.json([BASE_USER])),
        http.delete(`${API_BASE_URL}/users/${BASE_USER.id}`, () =>
          HttpResponse.json(
            { detail: "This user cannot be deleted because they have existing records." },
            { status: 409 },
          ),
        ),
      );

      render(<UserManagement />);
      await screen.findByText("user1@example.com");

      await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
      await userEvent.click(screen.getByRole("button", { name: /confirm delete/i }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/cannot be deleted/i);
      expect(screen.getByText("user1@example.com")).toBeInTheDocument();
    });
  });
});
