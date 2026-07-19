import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { server } from "../test/mocks/server";
import AttendanceSheet from "./AttendanceSheet";

const API_BASE_URL = "http://localhost:8000/api/v1";

let mockCanRead = true;
let mockCanWrite = true;
vi.mock("../hooks/useAccess", () => ({
  useAccess: () => ({ canRead: mockCanRead, canWrite: mockCanWrite }),
}));

const EVENT = {
  id: "event-1",
  name: "Weekly Dinner",
  event_date: "2026-07-08",
  event_type: "dinner",
  rotary_year: 2025,
  created_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function activeMember(present = false) {
  return {
    member_id: "member-active",
    first_name: "Jane",
    last_name: "Doe",
    member_status_snapshot: "active",
    present,
  };
}

function pastMember(present = false) {
  return {
    member_id: "member-past",
    first_name: "Old",
    last_name: "Timer",
    member_status_snapshot: "past",
    present,
  };
}

function buildSheet({ active = [activeMember()], past = [] } = {}) {
  const presentCount = [...active, ...past].filter((m) => m.present).length;
  return {
    event: EVENT,
    active,
    honorary: [],
    past,
    present_count: presentCount,
    eligible_total: active.length,
    attendance_percentage: active.length ? Math.round((presentCount / active.length) * 1000) / 10 : 0,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/dinners/event-1"]}>
      <Routes>
        <Route path="/dinners/:eventId" element={<AttendanceSheet />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function waitForLoaded() {
  await waitFor(() => expect(screen.queryByText(/^loading…$/i)).not.toBeInTheDocument());
}

describe("AttendanceSheet", () => {
  it("renders active members and header count", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    server.use(
      http.get(`${API_BASE_URL}/attendance/events/event-1/sheet`, () =>
        HttpResponse.json(buildSheet()),
      ),
    );

    renderPage();
    await waitForLoaded();

    expect(screen.getByText("Weekly Dinner")).toBeInTheDocument();
    expect(screen.getByLabelText(/mark jane doe present/i)).not.toBeChecked();
  });

  it("toggles present via checkbox with optimistic UI", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    server.use(
      http.get(`${API_BASE_URL}/attendance/events/event-1/sheet`, () =>
        HttpResponse.json(buildSheet()),
      ),
      http.patch(`${API_BASE_URL}/attendance/events/event-1/records/member-active`, () =>
        HttpResponse.json({ ...activeMember(true) }),
      ),
    );

    renderPage();
    await waitForLoaded();

    await userEvent.click(screen.getByLabelText(/mark jane doe present/i));
    await waitFor(() => expect(screen.getByLabelText(/mark jane doe present/i)).toBeChecked());
    expect(screen.getByText(/1 \/ 1/)).toBeInTheDocument();
  });

  it("keeps past members collapsed by default and expandable", async () => {
    mockCanRead = true;
    mockCanWrite = true;
    server.use(
      http.get(`${API_BASE_URL}/attendance/events/event-1/sheet`, () =>
        HttpResponse.json(buildSheet({ past: [pastMember()] })),
      ),
    );

    renderPage();
    await waitForLoaded();

    expect(screen.queryByText("Old Timer")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText(/past members/i));
    expect(await screen.findByText("Old Timer")).toBeInTheDocument();
  });

  it("disables checkboxes for a read-only user", async () => {
    mockCanRead = true;
    mockCanWrite = false;
    server.use(
      http.get(`${API_BASE_URL}/attendance/events/event-1/sheet`, () =>
        HttpResponse.json(buildSheet()),
      ),
    );

    renderPage();
    await waitForLoaded();

    expect(screen.getByLabelText(/mark jane doe present/i)).toBeDisabled();
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
  });

  it("denies access for a user without attendance.sheet read", async () => {
    mockCanRead = false;
    mockCanWrite = false;
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent(/do not have permission/i);
  });

  describe("future-dated event (Story 16.9)", () => {
    it("shows a banner, hides the stat pill, and disables the checklist even with saved marks", async () => {
      mockCanRead = true;
      mockCanWrite = true;
      const futureSheet = {
        ...buildSheet({ active: [activeMember(true)] }),
        event: { ...EVENT, event_date: "2027-03-15" },
      };
      server.use(
        http.get(`${API_BASE_URL}/attendance/events/event-1/sheet`, () =>
          HttpResponse.json(futureSheet),
        ),
      );

      renderPage();
      await waitForLoaded();

      expect(screen.getByText(/hasn't taken place yet/i)).toBeInTheDocument();
      expect(screen.queryByText(/present \(/i)).not.toBeInTheDocument();
      const checkbox = screen.getByLabelText(/mark jane doe present/i);
      expect(checkbox).toBeDisabled();
      expect(checkbox).toBeChecked();
    });
  });
});
