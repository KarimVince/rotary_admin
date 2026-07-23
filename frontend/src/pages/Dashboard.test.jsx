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
    // Story 16.21 — same default-empty treatment for the Club Planning
    // section's fetches.
    server.use(
      http.get(`${API_BASE_URL}/board/positions`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/board/assignments`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/dinner-forecast/events`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/dinner-event-types`, () => HttpResponse.json([])),
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
          total_funds_raised_this_year: 1500,
          service_hours_this_year: 32,
        }),
      ),
    );

    renderDashboard();

    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("4,200 €")).toBeInTheDocument();
    expect(screen.getByText("1,500 €")).toBeInTheDocument();
    expect(screen.getByText("32 h")).toBeInTheDocument();
    expect(screen.getByText("Active members")).toBeInTheDocument();
    expect(screen.getByText("Honorary members")).toBeInTheDocument();
    expect(screen.getByText("NGOs supported")).toBeInTheDocument();
    // Story 16.21: the "Friends of Rotary" stat card was removed (keeps the
    // recap row at 6 cards / 2 lines) — the label now appears only once, as
    // the module quick-access link.
    expect(screen.getAllByText("Friends of Rotary")).toHaveLength(1);
    expect(screen.getByText("Donations this rotary year")).toBeInTheDocument();
    expect(screen.getByText("Total funds raised this rotary year")).toBeInTheDocument();
    expect(screen.getByText("Volunteer hours this rotary year")).toBeInTheDocument();
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
    expect(screen.getByRole("link", { name: /ngo & services project/i })).toHaveAttribute(
      "href",
      "/ngos",
    );
    expect(screen.getByRole("link", { name: /member fees/i })).toHaveAttribute("href", "/fees");
    expect(screen.getByRole("link", { name: /board/i })).toHaveAttribute(
      "href",
      "/board/positions",
    );
    expect(screen.getByRole("link", { name: /dinner attendance/i })).toHaveAttribute(
      "href",
      "/dinners",
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
    expect(screen.queryByRole("link", { name: /board/i })).not.toBeInTheDocument();
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
      { id: "pos-president", name: "President", display_order: 1, at_the_board: true },
      { id: "pos-secretary", name: "Secretary", display_order: 2, at_the_board: true },
    ];

    it("shows a card per assigned member, ordered by display_order, with photo/monogram and role", async () => {
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
              member: { id: "mem-sam", first_name: "Sam", last_name: "Lee" },
            },
            {
              board_position_id: "pos-president",
              end_date: null,
              member: {
                id: "mem-jane",
                first_name: "Jane",
                last_name: "Doe",
                photo_url: "/uploads/jane.jpg",
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
      expect(screen.getByAltText("")).toHaveAttribute(
        "src",
        expect.stringContaining("/uploads/jane.jpg"),
      );

      expect(screen.getByText("Sam Lee")).toBeInTheDocument();
      expect(screen.getByText("SL")).toBeInTheDocument(); // monogram fallback, no photo
    });

    it("shows one card listing every role when a member holds multiple positions", async () => {
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
              member: { id: "mem-jane", first_name: "Jane", last_name: "Doe" },
            },
            {
              board_position_id: "pos-president",
              end_date: null,
              member: { id: "mem-jane", first_name: "Jane", last_name: "Doe" },
            },
          ]),
        ),
      );

      renderDashboard();

      expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
      expect(screen.getByText("President · Secretary")).toBeInTheDocument();
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
              member: { id: "mem-jane", first_name: "Jane", last_name: "Doe" },
            },
          ]),
        ),
      );

      renderDashboard();

      await screen.findByText("President");
      expect(screen.queryByText("Secretary")).not.toBeInTheDocument();
    });

    it("omits an assigned position whose at_the_board flag is false", async () => {
      mockRole = "admin";
      mockDeniedKeys = new Set();
      server.use(
        http.get(`${API_BASE_URL}/dashboard/summary`, () => HttpResponse.json({})),
        http.get(`${API_BASE_URL}/board/positions`, () =>
          HttpResponse.json([
            ...POSITIONS,
            { id: "pos-speaker", name: "Speaker Coordinator", display_order: 3, at_the_board: false },
          ]),
        ),
        http.get(`${API_BASE_URL}/board/assignments`, () =>
          HttpResponse.json([
            {
              board_position_id: "pos-president",
              end_date: null,
              member: { id: "mem-jane", first_name: "Jane", last_name: "Doe" },
            },
            {
              board_position_id: "pos-speaker",
              end_date: null,
              member: { id: "mem-sam", first_name: "Sam", last_name: "Lee" },
            },
          ]),
        ),
      );

      renderDashboard();

      await screen.findByText("President");
      expect(screen.queryByText("Speaker Coordinator")).not.toBeInTheDocument();
      expect(screen.queryByText("Sam Lee")).not.toBeInTheDocument();
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
              member: { id: "mem-jane", first_name: "Jane", last_name: "Doe" },
            },
          ]),
        ),
      );

      renderDashboard();

      await screen.findByRole("link", { name: /members/i });
      expect(screen.queryByText("President")).not.toBeInTheDocument();
    });
  });

  describe("Club Planning (Story 16.21)", () => {
    function monthKey(offset) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }

    const BASE_EVENT = {
      id: "event-1",
      name: "Welcome Dinner",
      event_type: "Dinner",
      location: "Club House",
      speaker_name: "Jane Speaker",
      ngo_organisation_name: null,
      speaker_rotary_contact_member_id: null,
      topics_description: null,
      member_only: false,
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      attendance_started: false,
      present_count: null,
      eligible_total: null,
      attendance_percentage: null,
    };

    it("shows a compact date/type/location/speaker row per event, for the current + next 2 months", async () => {
      mockRole = "admin";
      mockDeniedKeys = new Set();
      const currentMonthEvent = {
        ...BASE_EVENT,
        id: "event-current",
        name: "Current Month Dinner",
        location: "Club House",
        speaker_name: "Jane Speaker",
        event_date: `${monthKey(0)}-05`,
        attendance_started: true,
        present_count: 8,
        eligible_total: 10,
        attendance_percentage: 80,
      };
      const nextMonthEvent = {
        ...BASE_EVENT,
        id: "event-next",
        name: "Next Month Fellowship",
        location: "Harbour View",
        speaker_name: "John Guest",
        event_date: `${monthKey(1)}-10`,
      };
      const farOutEvent = {
        ...BASE_EVENT,
        id: "event-far",
        name: "Far Out Gala",
        event_date: `${monthKey(6)}-01`,
      };
      server.use(
        http.get(`${API_BASE_URL}/dashboard/summary`, () => HttpResponse.json({})),
        http.get(`${API_BASE_URL}/dinner-forecast/events`, () =>
          HttpResponse.json([currentMonthEvent, nextMonthEvent, farOutEvent]),
        ),
      );

      renderDashboard();

      expect(await screen.findByText("Club Planning")).toBeInTheDocument();
      // Compact rows show date + type, location, and speaker — no event
      // name, no attendance chip, no actions (unlike the full Dinner/Events
      // page row).
      expect(screen.getByText("Club House")).toBeInTheDocument();
      expect(screen.getByText(/Jane Speaker/)).toBeInTheDocument();
      expect(screen.getByText("Harbour View")).toBeInTheDocument();
      expect(screen.getByText(/John Guest/)).toBeInTheDocument();
      expect(screen.queryByText("Current Month Dinner")).not.toBeInTheDocument();
      expect(screen.queryByText("8/10 · 80%")).not.toBeInTheDocument();
      // The far-out event (6 months from now) falls outside the 3-month window.
      expect(screen.queryByText("Far Out Gala")).not.toBeInTheDocument();
    });

    it("appends the formatted start time to the date when set (Story 16.27)", async () => {
      mockRole = "admin";
      mockDeniedKeys = new Set();
      const timedEvent = {
        ...BASE_EVENT,
        id: "event-timed",
        event_date: `${monthKey(0)}-05`,
        start_time: "19:00:00",
      };
      server.use(
        http.get(`${API_BASE_URL}/dashboard/summary`, () => HttpResponse.json({})),
        http.get(`${API_BASE_URL}/dinner-forecast/events`, () => HttpResponse.json([timedEvent])),
      );

      renderDashboard();

      expect(await screen.findByText(/7:00 PM/)).toBeInTheDocument();
    });

    it("shows all 3 months even when there are no events", async () => {
      mockRole = "admin";
      mockDeniedKeys = new Set();
      server.use(http.get(`${API_BASE_URL}/dashboard/summary`, () => HttpResponse.json({})));

      renderDashboard();

      await screen.findByText("Club Planning");
      expect(screen.getAllByText("No events this month")).toHaveLength(3);
    });

    it("hides the Club Planning section for a user without attendance.forecast access", async () => {
      mockRole = "user";
      mockDeniedKeys = new Set(["attendance.forecast"]);
      server.use(http.get(`${API_BASE_URL}/dashboard/summary`, () => HttpResponse.json({})));

      renderDashboard();

      await screen.findByRole("link", { name: /members/i });
      expect(screen.queryByText("Club Planning")).not.toBeInTheDocument();
    });
  });
});
