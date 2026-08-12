import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import { ThemeProvider } from "../context/ThemeContext";
import EventManageProject from "./EventManageProject";

const API_BASE_URL = "http://localhost:8000/api/v1";

vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: true, canWrite: true }),
}));

const EVENT_1 = {
  id: "event-1",
  name: "Annual Ball",
  date: "2026-08-15",
  created_at: "2026-01-01T00:00:00Z",
  rotary_year: 2026,
};
const EVENT_2 = {
  id: "event-2",
  name: "Fellowship Night",
  date: "2026-09-01",
  created_at: "2026-02-01T00:00:00Z",
  rotary_year: 2026,
};

const ROTARY_YEARS = [{ id: "ry-1", year: 2026, is_current: true }];

const SUMMARY = {
  total_raised: 0,
  auction_total: 0,
  lucky_draw_total: 0,
  other_donation: 0,
  total_revenue: 1000,
  ticket_revenue: 0,
  sponsor_revenue: 0,
  total_cost: 200,
  cost_per_category: [],
  net_operational_result: 800,
  revenue_breakdown: [],
  cost_breakdown: [],
  result_overview: [],
};

function renderManageProject(initialPath = "/events/manage?event=event-1") {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/events/manage" element={<EventManageProject />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe("EventManageProject", () => {
  beforeEach(() => {
    sessionStorage.clear();
    server.use(
      http.get(`${API_BASE_URL}/events`, () => HttpResponse.json([EVENT_1, EVENT_2])),
      http.get(`${API_BASE_URL}/rotary-years`, () => HttpResponse.json(ROTARY_YEARS)),
      http.get(`${API_BASE_URL}/members`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/events/:eventId/summary`, () => HttpResponse.json(SUMMARY)),
      http.get(`${API_BASE_URL}/events/:eventId/setup`, () => HttpResponse.json({})),
      http.get(`${API_BASE_URL}/events/:eventId/guests`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/events/:eventId/sponsors`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/events/:eventId/costs`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/events/:eventId/items`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/events/:eventId/lucky-draw-config`, () =>
        HttpResponse.json({ tickets_sold: 0, other_donation: 0 }),
      ),
      http.get(`${API_BASE_URL}/events/:eventId/rundown`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/events/:eventId/table-mapping`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/event-cost-categories`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/event-sponsor-categories`, () => HttpResponse.json([])),
    );
  });

  it("deep-links ?event= into the selected event and shows the bento overview", async () => {
    renderManageProject("/events/manage?event=event-1");

    expect(await screen.findByRole("button", { name: /Project/i })).toHaveTextContent(
      "Annual Ball — 15 Aug 2026",
    );
    expect(screen.getByRole("button", { name: "Guest List" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rundown" })).toBeInTheDocument();
  });

  it("opens a panel via ?panel= and shows the breadcrumb", async () => {
    renderManageProject("/events/manage?event=event-1&panel=guests");

    expect(await screen.findByRole("button", { name: /all panels/i })).toBeInTheDocument();
    expect(await screen.findByText(/no guests registered/i)).toBeInTheDocument();
  });

  it("clicking a bento card link opens the matching panel", async () => {
    renderManageProject("/events/manage?event=event-1");
    await screen.findByRole("button", { name: "Guest List" });

    await userEvent.click(screen.getByRole("button", { name: "Guest List" }));

    expect(await screen.findByText(/no guests registered/i)).toBeInTheDocument();
  });

  it("clicking the breadcrumb clears the panel and keeps the same event selected", async () => {
    renderManageProject("/events/manage?event=event-1&panel=guests");
    await screen.findByRole("button", { name: /all panels/i });

    await userEvent.click(screen.getByRole("button", { name: /all panels/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Guest List" })).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /Project/i })).toHaveTextContent(
      "Annual Ball — 15 Aug 2026",
    );
  });

  it("switching the event pill re-fetches panel data for the new event", async () => {
    renderManageProject("/events/manage?event=event-1");
    const projectTrigger = await screen.findByRole("button", { name: /Project/i });
    expect(projectTrigger).toHaveTextContent("Annual Ball — 15 Aug 2026");

    await userEvent.click(projectTrigger);
    await userEvent.click(screen.getByRole("option", { name: /Fellowship Night/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Project/i })).toHaveTextContent(
        "Fellowship Night — 01 Sep 2026",
      ),
    );
  });
});
