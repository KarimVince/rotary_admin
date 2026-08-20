import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import AdminConnectionLog from "./AdminConnectionLog";

const API_BASE_URL = "http://localhost:8000/api/v1";

let mockCanRead = true;
vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: mockCanRead, canWrite: false }),
}));

const STATS = {
  trend: [
    { date: "2026-08-17", count: 2 },
    { date: "2026-08-18", count: 3 },
  ],
  most_active: [{ user_id: "user-1", full_name: "Jane Secretary", email: "jane@example.com", login_count: 5 }],
  last_login: [
    {
      user_id: "user-1",
      full_name: "Jane Secretary",
      email: "jane@example.com",
      last_login_at: "2026-08-18T10:00:00Z",
    },
    {
      user_id: "user-2",
      full_name: "Never Logged",
      email: "never@example.com",
      last_login_at: null,
    },
  ],
};

const LOG_ENTRY = {
  id: "log-1",
  user_id: "user-1",
  user_email: "jane@example.com",
  user_full_name: "Jane Secretary",
  ip_address: "203.0.113.5",
  created_at: "2026-08-18T10:00:00Z",
};

function renderPage() {
  return render(<AdminConnectionLog />);
}

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
}

describe("AdminConnectionLog", () => {
  it("shows a permission-denied message when the user has no access", () => {
    mockCanRead = false;
    renderPage();
    expect(screen.getByRole("alert")).toHaveTextContent(/do not have permission/i);
  });

  it("shows stats and the connection log for an authorized user", async () => {
    mockCanRead = true;
    server.use(
      http.get(`${API_BASE_URL}/connection-logs/stats`, () => HttpResponse.json(STATS)),
      http.get(`${API_BASE_URL}/connection-logs`, () => HttpResponse.json([LOG_ENTRY])),
    );

    renderPage();
    await waitForLoaded();

    expect(await screen.findByText("Logins over time (last 30 days)")).toBeInTheDocument();
    expect(screen.getByText("Most active users (last 30 days)")).toBeInTheDocument();
    expect(screen.getByText("Last login per user")).toBeInTheDocument();
    expect(screen.getAllByText(/jane secretary/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/never logged/i)).toBeInTheDocument();
    expect(screen.getByText("203.0.113.5")).toBeInTheDocument();
  });

  it("shows empty states when there's no data", async () => {
    mockCanRead = true;
    server.use(
      http.get(`${API_BASE_URL}/connection-logs/stats`, () =>
        HttpResponse.json({ trend: [], most_active: [], last_login: [] }),
      ),
      http.get(`${API_BASE_URL}/connection-logs`, () => HttpResponse.json([])),
    );

    renderPage();
    await waitForLoaded();

    expect(await screen.findAllByText(/no logins recorded/i)).toHaveLength(2);
    expect(screen.getByText(/no connection log entries match/i)).toBeInTheDocument();
  });

  it("refetches the log when the date filters change", async () => {
    mockCanRead = true;
    let capturedUrl;
    server.use(
      http.get(`${API_BASE_URL}/connection-logs/stats`, () => HttpResponse.json(STATS)),
      http.get(`${API_BASE_URL}/connection-logs`, ({ request }) => {
        capturedUrl = new URL(request.url);
        return HttpResponse.json([LOG_ENTRY]);
      }),
    );

    renderPage();
    await waitForLoaded();

    await userEvent.type(screen.getByLabelText(/^from$/i), "2026-08-01");
    await waitFor(() => expect(capturedUrl.searchParams.get("date_from")).toBe("2026-08-01"));
  });
});
