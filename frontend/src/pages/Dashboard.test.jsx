import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  beforeEach(() => {
    // Story 8.19 — default the board strip's fetches to empty so existing
    // tests (which don't know about the board strip) don't need to mock it.
    server.use(
      http.get(`${API_BASE_URL}/board/positions`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/board/assignments`, () => HttpResponse.json([])),
    );
  });

  it("renders stat cards with values from the summary endpoint", async () => {
    mockRole = "admin";
    server.use(
      http.get(`${API_BASE_URL}/dashboard/summary`, () =>
        HttpResponse.json({
          active_members: 12,
          honorary_members: 4,
          organisations_supported: 3,
          rotary_friends: 7,
          donations_this_year: 4200,
          fees_collected_this_year: 1500,
        }),
      ),
    );

    renderDashboard();

    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("4,200 €")).toBeInTheDocument();
    expect(screen.getByText("1,500 €")).toBeInTheDocument();
    expect(screen.getByText("Active members")).toBeInTheDocument();
    expect(screen.getByText("Honorary members")).toBeInTheDocument();
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
    expect(screen.getByRole("link", { name: /dinner attendance/i })).toHaveAttribute(
      "href",
      "/dinners/attendance",
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

  it("hides the Honorary Members stat card for a user without members Read access", () => {
    mockRole = "user";
    mockDeniedKeys = new Set(["members"]);
    server.use(
      http.get(`${API_BASE_URL}/dashboard/summary`, () =>
        HttpResponse.json({ active_members: 12, honorary_members: 4 }),
      ),
    );

    renderDashboard();

    expect(screen.queryByText("Honorary members")).not.toBeInTheDocument();
  });

  it("hides the Dinner Attendance module card for a user without attendance Read access", () => {
    mockRole = "user";
    mockDeniedKeys = new Set(["attendance"]);
    server.use(
      http.get(`${API_BASE_URL}/dashboard/summary`, () => HttpResponse.json({})),
    );

    renderDashboard();

    expect(
      screen.queryByRole("link", { name: /dinner attendance/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /members/i })).toBeInTheDocument();
  });

  describe("board strip", () => {
    const POSITIONS = [
      { id: "pos-president", name: "President", display_order: 1 },
      { id: "pos-secretary", name: "Secretary", display_order: 2 },
    ];

    // A birthdate exactly 45 years before "today" (same month/day), so the
    // component's age computation is deterministic regardless of test run date.
    const today = new Date();
    const DOB_45_YEARS_AGO = new Date(today.getFullYear() - 45, today.getMonth(), today.getDate())
      .toISOString()
      .slice(0, 10);

    it("shows a card per assigned position, ordered by display_order, with photo/monogram and age/gender/country", async () => {
      mockRole = "admin";
      mockDeniedKeys = new Set();
      server.use(
        http.get(`${API_BASE_URL}/dashboard/summary`, () => HttpResponse.json({})),
        http.get(`${API_BASE_URL}/board/positions`, () => HttpResponse.json(POSITIONS)),
        http.get(`${API_BASE_URL}/board/assignments`, () =>
          HttpResponse.json([
            {
              board_position_id: "pos-secretary",
              end_date: null,
              member: {
                first_name: "Sam",
                last_name: "Lee",
                gender: "Female",
                nationality: "Hong Kong",
              },
            },
            {
              board_position_id: "pos-president",
              end_date: null,
              member: {
                first_name: "Jane",
                last_name: "Doe",
                photo_url: "/uploads/jane.jpg",
                date_of_birth: DOB_45_YEARS_AGO,
                gender: "Female",
                nationality: "France",
              },
            },
          ]),
        ),
      );

      renderDashboard();

      const president = await screen.findByText("President");
      const secretary = screen.getByText("Secretary");
      // President (display_order 1) renders before Secretary (display_order 2).
      expect(
        president.compareDocumentPosition(secretary) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      expect(screen.getByText("Jane Doe")).toBeInTheDocument();
      expect(screen.getByText("45y · Female · France")).toBeInTheDocument();
      expect(screen.getByAltText("")).toHaveAttribute(
        "src",
        expect.stringContaining("/uploads/jane.jpg"),
      );

      expect(screen.getByText("Sam Lee")).toBeInTheDocument();
      // No email/phone shown — only age/gender/country, and age is omitted
      // when date_of_birth is missing.
      expect(screen.getByText("Female · Hong Kong")).toBeInTheDocument();
      expect(screen.getByText("SL")).toBeInTheDocument(); // monogram fallback, no photo
    });

    it("omits vacant positions", async () => {
      mockRole = "admin";
      mockDeniedKeys = new Set();
      server.use(
        http.get(`${API_BASE_URL}/dashboard/summary`, () => HttpResponse.json({})),
        http.get(`${API_BASE_URL}/board/positions`, () => HttpResponse.json(POSITIONS)),
        http.get(`${API_BASE_URL}/board/assignments`, () =>
          HttpResponse.json([
            {
              board_position_id: "pos-president",
              end_date: null,
              member: { first_name: "Jane", last_name: "Doe" },
            },
          ]),
        ),
      );

      renderDashboard();

      await screen.findByText("President");
      expect(screen.queryByText("Secretary")).not.toBeInTheDocument();
    });

    it("hides the whole zone when no positions are assigned", async () => {
      mockRole = "admin";
      mockDeniedKeys = new Set();
      server.use(
        http.get(`${API_BASE_URL}/dashboard/summary`, () => HttpResponse.json({})),
        http.get(`${API_BASE_URL}/board/positions`, () => HttpResponse.json(POSITIONS)),
        http.get(`${API_BASE_URL}/board/assignments`, () => HttpResponse.json([])),
      );

      renderDashboard();

      await screen.findByRole("link", { name: /members/i });
      expect(screen.queryByText("President")).not.toBeInTheDocument();
      expect(screen.queryByText("Secretary")).not.toBeInTheDocument();
    });

    it("hides the whole zone for a user without board Read access", async () => {
      mockRole = "user";
      mockDeniedKeys = new Set(["board"]);
      server.use(
        http.get(`${API_BASE_URL}/dashboard/summary`, () => HttpResponse.json({})),
        http.get(`${API_BASE_URL}/board/positions`, () => HttpResponse.json(POSITIONS)),
        http.get(`${API_BASE_URL}/board/assignments`, () =>
          HttpResponse.json([
            {
              board_position_id: "pos-president",
              end_date: null,
              member: { first_name: "Jane", last_name: "Doe" },
            },
          ]),
        ),
      );

      renderDashboard();

      await screen.findByRole("link", { name: /members/i });
      expect(screen.queryByText("President")).not.toBeInTheDocument();
    });
  });
});
