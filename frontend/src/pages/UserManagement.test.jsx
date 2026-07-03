import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../test/mocks/server";
import UserManagement from "./UserManagement";

const API_BASE_URL = "http://localhost:8000/api";

const BASE_USER = {
  id: "user-1",
  email: "user1@example.com",
  full_name: "User One",
  role: "user",
  member_id: null,
  is_active: true,
  created_at: new Date().toISOString(),
};

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
}

describe("UserManagement", () => {
  it("lists users fetched from the API", async () => {
    server.use(http.get(`${API_BASE_URL}/users`, () => HttpResponse.json([BASE_USER])));

    render(<UserManagement />);

    expect(await screen.findByText("user1@example.com")).toBeInTheDocument();
  });

  it("creates a user and refreshes the list", async () => {
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
      "treasurer",
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/role for user1@example.com/i)).toHaveValue("treasurer"),
    );
  });
});
