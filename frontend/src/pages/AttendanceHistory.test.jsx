import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import { currentRotaryYear } from "../utils/rotaryYear";
import AttendanceHistory from "./AttendanceHistory";

const API_BASE_URL = "http://localhost:8000/api/v1";
const YEAR = currentRotaryYear();

let mockCanRead = true;
let mockCanWrite = true;
vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: mockCanRead, canWrite: mockCanWrite }),
}));

const EVENT = {
  id: "event-1",
  name: "Weekly Dinner",
  event_date: `${YEAR}-07-08`,
  event_type: "dinner",
  rotary_year: YEAR,
  created_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  present_count: 28,
  eligible_total: 42,
  attendance_percentage: 66.7,
  active_present: 25,
  honorary_present: 3,
  past_present: 0,
};

const STATS = {
  rotary_year: YEAR,
  total_events: 1,
  average_attendance: 28,
  average_attendance_percentage: 66.7,
  eligible_member_count: 42,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/dinners/attendance"]}>
      <Routes>
        <Route path="/dinners/attendance" element={<AttendanceHistory />} />
        <Route path="/dinners/attendance/:eventId" element={<div>Sheet page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
}

describe("AttendanceHistory", () => {
  it("lists events with per-row stats and a stats banner", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    server.use(
      http.get(`${API_BASE_URL}/attendance/events`, () => HttpResponse.json([EVENT])),
      http.get(`${API_BASE_URL}/attendance/stats`, () => HttpResponse.json(STATS)),
    );

    renderPage();
    await waitForLoaded();

    expect(screen.getByText("Weekly Dinner")).toBeInTheDocument();
    expect(screen.getByText(/28 \/ 42/)).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument(); // total events stat
  });

  it("navigates to the sheet when a row is clicked", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    server.use(
      http.get(`${API_BASE_URL}/attendance/events`, () => HttpResponse.json([EVENT])),
      http.get(`${API_BASE_URL}/attendance/stats`, () => HttpResponse.json(STATS)),
    );

    renderPage();
    await waitForLoaded();

    await userEvent.click(screen.getByText("Weekly Dinner"));
    expect(await screen.findByText("Sheet page")).toBeInTheDocument();
  });

  it("shows an empty state when no events exist for the selected year", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    server.use(
      http.get(`${API_BASE_URL}/attendance/events`, () => HttpResponse.json([])),
      http.get(`${API_BASE_URL}/attendance/stats`, () =>
        HttpResponse.json({
          rotary_year: YEAR,
          total_events: 0,
          average_attendance: null,
          average_attendance_percentage: null,
          eligible_member_count: 0,
        }),
      ),
    );

    renderPage();
    await waitForLoaded();

    expect(screen.getByText(/no events recorded/i)).toBeInTheDocument();
  });

  it("hides the New Event button for read-only users", async () => {
    mockCanRead = true;
    mockCanWrite = false;
    server.use(
      http.get(`${API_BASE_URL}/attendance/events`, () => HttpResponse.json([EVENT])),
      http.get(`${API_BASE_URL}/attendance/stats`, () => HttpResponse.json(STATS)),
    );

    renderPage();
    await waitForLoaded();

    expect(screen.queryByText("New Event")).not.toBeInTheDocument();
  });

  it("denies access for a user without attendance.history read", async () => {
    mockCanRead = false;
    mockCanWrite = false;
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(/do not have permission/i);
  });
});
