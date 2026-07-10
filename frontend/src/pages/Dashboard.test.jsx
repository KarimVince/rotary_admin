import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import Dashboard from "./Dashboard";

const API_BASE_URL = "http://localhost:8000/api/v1";

let mockRole = "admin";
vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ user: { full_name: "Admin", role: mockRole } }),
}));

let mockDeniedKeys = new Set();
vi.mock("../hooks/useAccess", () => ({
  useAccess: (key) => {
    const canRead = !mockDeniedKeys.has(key);
    return { canRead, canWrite: canRead };
  },
}));

function renderDashboard() {
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

describe("Dashboard", () => {
  it("renders stat cards with values from the summary endpoint", async () => {
    mockRole = "admin";
    server.use(
      http.get(`${API_BASE_URL}/dashboard/summary`, () =>
        HttpResponse.json({
          active_members: 12,
          organisations_supported: 3,
          rotary_friends: 7,
          donations_this_year: 4200,
          fees_collected_this_year: 1500,
        }),
      ),
    );

    renderDashboard();

    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("4,200 €")).toBeInTheDocument();
    expect(screen.getByText("1,500 €")).toBeInTheDocument();
    expect(screen.getByText("Active members")).toBeInTheDocument();
    expect(screen.getByText("NGOs supported")).toBeInTheDocument();
    // "Friends of Rotary" also appears as a module quick-access link label.
    expect(screen.getAllByText("Friends of Rotary").length).toBeGreaterThan(0);
    expect(screen.getByText("Donations this rotary year")).toBeInTheDocument();
    expect(screen.getByText("Fees collected this rotary year")).toBeInTheDocument();
  });

  it("shows an error message when the summary request fails", async () => {
    mockRole = "admin";
    server.use(
      http.get(`${API_BASE_URL}/dashboard/summary`, () =>
        HttpResponse.json({ detail: "Server error" }, { status: 500 }),
      ),
    );

    renderDashboard();

    expect(await screen.findByRole("alert")).toHaveTextContent(/server error/i);
  });

  it("shows quick-access module cards for an admin, including Member Fees", () => {
    mockRole = "admin";
    mockDeniedKeys = new Set();
    server.use(
      http.get(`${API_BASE_URL}/dashboard/summary`, () => HttpResponse.json({})),
    );

    renderDashboard();

    expect(screen.getByRole("link", { name: /members/i })).toHaveAttribute("href", "/members");
    expect(screen.getByRole("link", { name: /ngos & donations/i })).toHaveAttribute(
      "href",
      "/ngos",
    );
    expect(screen.getByRole("link", { name: /member fees/i })).toHaveAttribute(
      "href",
      "/fees/settings",
    );
    expect(screen.getByRole("link", { name: /^board$/i })).toHaveAttribute(
      "href",
      "/board/positions",
    );
  });

  it("hides the Member Fees and Board module cards for a regular user", () => {
    mockRole = "user";
    mockDeniedKeys = new Set(["fees", "board"]);
    server.use(
      http.get(`${API_BASE_URL}/dashboard/summary`, () => HttpResponse.json({})),
    );

    renderDashboard();

    expect(screen.queryByRole("link", { name: /member fees/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^board$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /members/i })).toBeInTheDocument();
  });
});
